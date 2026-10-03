import { NextResponse, type NextRequest } from "next/server";
import { AG_COOKIE, readAgToken } from "@/lib/agegate-token";

/**
 * 年齢確認の一次チェック（署名と期限）。DB上の有効性はサーバー側（requireAgeGate / contentGuard）で再確認する。
 * ゲートの外：年齢確認・退出・法務ページ・削除請求・地域制限・管理画面のログイン
 */
const PUBLIC = [/^\/age-gate/, /^\/leave/, /^\/legal(\/|$)/, /^\/takedown/, /^\/unavailable/, /^\/admin/, /^\/robots\.txt$/];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname + search);

  if (!isApi && !PUBLIC.some((r) => r.test(pathname)) && !readAgToken(req.cookies.get(AG_COOKIE)?.value)) {
    const url = req.nextUrl.clone();
    url.pathname = "/age-gate";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  let newVk: string | null = null;
  if (!req.cookies.get("vk")) {
    newVk = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    // 最初のリクエストからサーバー側で同じ端末IDを使えるよう、リクエストにも載せる
    headers.set("cookie", [req.headers.get("cookie"), `vk=${newVk}`].filter(Boolean).join("; "));
  }
  const res = NextResponse.next({ request: { headers } });
  if (newVk) {
    const id = newVk;
    res.cookies.set("vk", id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 86400 });
  }
  if (!pathname.startsWith("/legal")) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  // /media は動画ファイル（推測できないURL・CDNと同じ扱い）。毎回の判定を省いて速く返す
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|media/|manifest.webmanifest|sw.js).*)"],
};
