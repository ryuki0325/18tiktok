import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { json, rateLimit } from "@/lib/http";
import { refreshUpload } from "@/lib/media";

/**
 * Bunny Stream の Webhook（変換完了など）。
 *
 * 【中身を信用しない】
 * 送られてきた内容はそのまま使わず、GUID をもとに Bunny の API に状態を聞き直す。
 * なので、嘘の内容を送られても動画の状態は書き換えられない。
 *
 * 【それでも鍵をかける理由】
 * 鍵がないと、誰でも何度でも呼べてしまい、そのたびに Bunny への問い合わせが走る。
 * BUNNY_WEBHOOK_SECRET を設定し、URL の末尾に ?t=<その値> を付けて登録する：
 *   https://<サイト>/api/v1/webhooks/bunny?t=<BUNNY_WEBHOOK_SECRET>
 * 設定していない場合も動くが、呼べる回数を制限する（設定することを強くおすすめする）。
 */
export async function POST(req: Request) {
  const secret = process.env.BUNNY_WEBHOOK_SECRET;
  if (secret) {
    const got = Buffer.from(new URL(req.url).searchParams.get("t") ?? "");
    const exp = Buffer.from(secret);
    if (got.length !== exp.length || !timingSafeEqual(got, exp)) return json({ ok: false }, 401);
  } else if (!(await rateLimit("webhook:bunny", 600, 3600))) {
    // 鍵がないときの保険。正しく使っていれば1時間に600回も来ない
    return json({ ok: false, error: "too many requests" }, 429);
  }

  const body = (await req.json().catch(() => null)) as { VideoGuid?: string } | null;
  const guid = body?.VideoGuid;
  if (!guid || !/^[0-9a-f-]{36}$/i.test(guid)) return json({ ok: false }, 400);
  const conn = await db();
  const [u] = await conn.select({ id: uploads.id }).from(uploads).where(eq(uploads.providerRef, guid));
  if (u) await refreshUpload(conn, u.id);
  return json({ ok: true });
}
