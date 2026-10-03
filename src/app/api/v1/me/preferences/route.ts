import { cookies } from "next/headers";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { contentGuard, json } from "@/lib/http";
import { parsePref } from "@/lib/theme";
import { THEME_COOKIE } from "@/lib/theme-server";

/** テーマ設定。Cookieに保存し（表示のちらつき防止）、ログイン中ならDBにも保存して端末間で同期 */
export async function PUT(req: Request) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const pref = parsePref(await req.json().catch(() => null));
  (await cookies()).set(THEME_COOKIE, JSON.stringify(pref), { sameSite: "lax", path: "/", maxAge: 400 * 86400, secure: process.env.NODE_ENV === "production" });
  const u = await currentUser();
  if (u) {
    await (await db()).insert(userPreferences).values({ userId: u.id, theme: pref })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { theme: pref, updatedAt: new Date() } });
  }
  return json({ theme: pref });
}
