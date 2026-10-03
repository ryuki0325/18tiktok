import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { linkHealthcheck, purgeExpired } from "@/lib/jobs";

/**
 * 定期実行用（外部のcronサービスから呼ぶ）。CRON_SECRET が必要。
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://（URL）/api/cron/link-health
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://（URL）/api/cron/purge
 */
export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return Response.json({ error: "CRON_SECRET が未設定です" }, { status: 503 });
  const got = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const exp = Buffer.from(secret);
  if (got.length !== exp.length || !timingSafeEqual(got, exp)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  const conn = await db();
  if (job === "link-health") return Response.json(await linkHealthcheck(conn));
  if (job === "purge") return Response.json(await purgeExpired(conn));
  return Response.json({ error: "unknown job" }, { status: 404 });
}
