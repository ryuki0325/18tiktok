import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { mediaDir } from "@/lib/media";

/**
 * provider=local の動画配信（Bunny などのCDNを使う場合は通らない）。
 * - 変換後のファイルは内容が変わらないので、ブラウザ・CDNに長くキャッシュさせる
 * - MP4 は Range（部分取得）に対応し、先頭から少しずつ読み込めるようにする
 * - CDN と同じく、推測できないURL（アップロードごとのUUID）で配信する。一覧や動画の場所は年齢確認済みのAPIからしか分からない
 */
const TYPES: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl", ".ts": "video/mp2t", ".m4s": "video/iso.segment", ".mp4": "video/mp4",
  ".mov": "video/quicktime", ".webm": "video/webm", ".jpg": "image/jpeg",
};

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  if (!parts.every((p) => /^[\w.-]+$/.test(p) && !p.startsWith("."))) return new Response("Not found", { status: 404 });
  const root = mediaDir();
  const file = path.join(root, ...parts);
  if (!file.startsWith(root + path.sep) || parts[0] === "_parts") return new Response("Not found", { status: 404 });
  const type = TYPES[path.extname(file)];
  if (!type) return new Response("Not found", { status: 404 });
  let size: number;
  try { const st = await stat(file); if (!st.isFile()) throw new Error(); size = st.size; } catch { return new Response("Not found", { status: 404 }); }

  const base = {
    "Content-Type": type, "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Cross-Origin-Resource-Policy": "same-origin",
  };
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...base, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` } });
  }
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { ...base, "Content-Length": String(size) } });
}
