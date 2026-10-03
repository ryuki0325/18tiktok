import { z } from "zod";
import { fail, json, sameOrigin } from "@/lib/http";
import { completeUpload } from "@/lib/media";
import { ownUpload } from "@/lib/upload-auth";

const Body = z.object({
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
  durationMs: z.number().int().nonnegative().max(24 * 3600_000).optional(),
  /** ブラウザで切り出したサムネイル（JPEG の data URL）。ffmpeg がない環境で使う */
  poster: z.string().max(400_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).optional(),
});

/** すべてのチャンクを送り終えた合図。ここから変換（HLS化）が始まる */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sameOrigin())) return fail("BAD_ORIGIN", "不正なリクエストです", 403);
  const r = await ownUpload((await params).id);
  if ("error" in r) return r.error;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("BAD_REQUEST", "送信内容が正しくありません");
  if (r.upload.status !== "uploading") return json({ id: r.upload.id, status: r.upload.status });
  if (r.upload.provider === "local" && r.upload.received !== r.upload.size) return fail("INCOMPLETE", "まだすべてのデータが届いていません", 409);
  const poster = p.data.poster ? Buffer.from(p.data.poster.split(",")[1], "base64") : null;
  const u = await completeUpload(r.conn, r.upload, { ...p.data, poster });
  return json({ id: u.id, status: u.status });
}
