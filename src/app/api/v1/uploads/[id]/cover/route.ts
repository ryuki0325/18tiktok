import { z } from "zod";
import { fail, json, sameOrigin } from "@/lib/http";
import { setCover, setCoverImage } from "@/lib/media";
import { ownUpload } from "@/lib/upload-auth";

// 動画のコマ（timeMs）を表紙にする／独自カバー画像（image）を表紙にする、のどちらか
const Body = z.union([
  z.object({ timeMs: z.number().int().min(0).max(24 * 3600_000) }),
  z.object({ image: z.object({ dataUrl: z.string().max(10_000_000), w: z.number().int().min(1).max(8000), h: z.number().int().min(1).max(8000) }) }),
]);

/** 表紙を決める：動画の中から選んだ1コマ、または投稿者がアップロードした独自カバー画像 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sameOrigin())) return fail("BAD_ORIGIN", "不正なリクエストです", 403);
  const r = await ownUpload((await params).id);
  if ("error" in r) return r.error;
  if (r.upload.status !== "ready") return fail("NOT_READY", "動画の準備ができてから選べます", 409);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("INVALID", "表紙の指定が正しくありません");
  if ("image" in p.data) {
    const res = await setCoverImage(r.conn, r.upload, p.data.image.dataUrl, p.data.image.w, p.data.image.h);
    if (!res.ok) return fail("INVALID", "カバー画像を保存できませんでした");
    return json(res);
  }
  const ok = await setCover(r.conn, r.upload, p.data.timeMs);
  return json({ ok });
}
