import { z } from "zod";
import { fail, json, sameOrigin } from "@/lib/http";
import { setCover } from "@/lib/media";
import { ownUpload } from "@/lib/upload-auth";

const Body = z.object({ timeMs: z.number().int().min(0).max(24 * 3600_000) });

/** 動画の中から選んだ1コマを表紙にする */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sameOrigin())) return fail("BAD_ORIGIN", "不正なリクエストです", 403);
  const r = await ownUpload((await params).id);
  if ("error" in r) return r.error;
  if (r.upload.status !== "ready") return fail("NOT_READY", "動画の準備ができてから選べます", 409);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("INVALID", "位置が正しくありません");
  const ok = await setCover(r.conn, r.upload, p.data.timeMs);
  return json({ ok });
}
