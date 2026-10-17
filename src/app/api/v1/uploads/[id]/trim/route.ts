import { z } from "zod";
import { fail, json, sameOrigin } from "@/lib/http";
import { MIN_TRIM_MS, setTrim } from "@/lib/media";
import { ownUpload } from "@/lib/upload-auth";

const MAX = 24 * 3600_000;
const Body = z.object({
  startMs: z.number().int().min(0).max(MAX),
  endMs: z.number().int().min(MIN_TRIM_MS).max(MAX),
}).nullable();

/**
 * 動画の切り取り（トリミング）の範囲を決める。
 * 範囲は変換のときに実際に切るので、切り落とした部分は配信されない。
 * null を送ると切り取りをやめて、元の長さに戻す。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sameOrigin())) return fail("BAD_ORIGIN", "不正なリクエストです", 403);
  const r = await ownUpload((await params).id);
  if ("error" in r) return r.error;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("INVALID", "切り取る範囲が正しくありません");
  if (p.data && p.data.endMs - p.data.startMs < MIN_TRIM_MS) return fail("INVALID", "切り取りが短すぎます");
  const res = await setTrim(r.conn, r.upload, p.data);
  if (!res.ok) return fail("CANNOT_TRIM", res.error ?? "切り取れませんでした", 409);
  return json({ ok: true });
}
