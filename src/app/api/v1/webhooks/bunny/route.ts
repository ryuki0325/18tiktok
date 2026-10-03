import { eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { json } from "@/lib/http";
import { refreshUpload } from "@/lib/media";

/**
 * Bunny Stream の Webhook（変換完了など）。中身は信用せず、GUID で Bunny の API に状態を問い合わせ直す。
 * Bunny の管理画面 → Stream → ライブラリ → Webhook URL に https://<サイト>/api/v1/webhooks/bunny を設定
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { VideoGuid?: string } | null;
  const guid = body?.VideoGuid;
  if (!guid || !/^[0-9a-f-]{36}$/i.test(guid)) return json({ ok: false }, 400);
  const conn = await db();
  const [u] = await conn.select({ id: uploads.id }).from(uploads).where(eq(uploads.providerRef, guid));
  if (u) await refreshUpload(conn, u.id);
  return json({ ok: true });
}
