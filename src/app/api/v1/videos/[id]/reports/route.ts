import { NextResponse } from "next/server";

/** 旧エンドポイント。通報は /api/v1/reports に一本化した */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => ({}));
  const url = new URL("/api/v1/reports", req.url);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: req.headers.get("cookie") ?? "", origin: req.headers.get("origin") ?? "" },
    body: JSON.stringify({ ...body, targetType: "video", targetId: (await params).id }),
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}
