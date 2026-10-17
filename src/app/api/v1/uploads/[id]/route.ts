import { json } from "@/lib/http";
import { refreshUpload } from "@/lib/media";
import { ownUpload } from "@/lib/upload-auth";

/** アップロードの状態（受け取り済みバイト数・変換の進み具合） */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownUpload((await params).id);
  if ("error" in r) return r.error;
  const u = await refreshUpload(r.conn, r.upload.id);
  return json({ id: u.id, status: u.status, size: u.size, received: u.received, playbackUrl: u.playbackUrl, thumbnailUrl: u.thumbnailUrl, width: u.width, height: u.height, durationMs: u.durationMs,
    trimStartMs: u.trimStartMs, trimEndMs: u.trimEndMs, error: u.error });
}
