import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/http";
import { appendChunk, CHUNK_SIZE } from "@/lib/media";
import { ownUpload } from "@/lib/upload-auth";

/**
 * provider=local のときの受け口（tus 1.0.0 の core + creation の最小実装）。
 * POST：作成（既に作ってあるので Location を返すだけ）／ HEAD：受け取り済みの位置 ／ PATCH：続きのチャンクを追記
 */
const TUS = { "Tus-Resumable": "1.0.0", "Cache-Control": "no-store" };
type Ctx = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...TUS, "Tus-Version": "1.0.0", "Tus-Extension": "creation", "Tus-Max-Size": String(CHUNK_SIZE) } });
}

export async function POST(req: Request, { params }: Ctx) {
  if (!(await sameOrigin())) return new NextResponse(null, { status: 403, headers: TUS });
  const r = await ownUpload((await params).id);
  if ("error" in r) return r.error;
  return new NextResponse(null, { status: 201, headers: { ...TUS, Location: new URL(req.url).pathname, "Upload-Offset": String(r.upload.received) } });
}

export async function HEAD(_: Request, { params }: Ctx) {
  const r = await ownUpload((await params).id);
  if (r.error) return new NextResponse(null, { status: r.error.status, headers: TUS });
  return new NextResponse(null, { status: 200, headers: { ...TUS, "Upload-Offset": String(r.upload.received), "Upload-Length": String(r.upload.size) } });
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await sameOrigin())) return new NextResponse(null, { status: 403, headers: TUS });
  const r = await ownUpload((await params).id);
  if ("error" in r) return r.error;
  if (r.upload.status !== "uploading") return new NextResponse(null, { status: 409, headers: { ...TUS, "Upload-Offset": String(r.upload.received) } });
  if (req.headers.get("content-type") !== "application/offset+octet-stream") return new NextResponse(null, { status: 415, headers: TUS });
  const offset = Number(req.headers.get("upload-offset"));
  if (!Number.isSafeInteger(offset) || offset < 0) return new NextResponse(null, { status: 400, headers: TUS });
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength > CHUNK_SIZE) return new NextResponse(null, { status: 413, headers: TUS });
  const res = await appendChunk(r.conn, r.upload, offset, body);
  return new NextResponse(null, { status: res.ok ? 204 : res.status, headers: { ...TUS, "Upload-Offset": String(res.received) } });
}
