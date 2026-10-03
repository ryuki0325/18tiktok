import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { currentUser, regionBlocked, requireAgeGate, viewerKey } from "./auth";
import { isAudience, type Audience } from "./audience";

/** ゲート内のページはすべてここを通す（年齢確認・地域をサーバーで再確認） */
export async function viewerContext() {
  const path = (await headers()).get("x-pathname") ?? "/";
  if (await regionBlocked()) redirect("/unavailable");
  await requireAgeGate(path);
  const user = await currentUser();
  const { preferredTags, audience } = await readTaste(user?.id ?? null);
  return { user, viewerKey: await viewerKey(), preferredTags, audience, userId: user?.id ?? null };
}

/** 好み（最初の分岐と好きなタグ）。ログイン中はDB、未ログインはCookie */
export async function readTaste(userId: string | null): Promise<{ preferredTags: string[]; audience: Audience }> {
  let preferredTags: string[] = [];
  let audience: Audience = "all";
  if (userId) {
    const [p] = await (await db()).select().from(userPreferences).where(eq(userPreferences.userId, userId));
    preferredTags = p?.preferredTags ?? [];
    if (p) audience = p.audience;
  }
  const jar = await cookies();
  if (!preferredTags.length) {
    try { preferredTags = JSON.parse(decodeURIComponent(jar.get("ptags")?.value ?? "[]")); } catch { preferredTags = []; }
  }
  if (audience === "all") { const c = jar.get("aud")?.value; if (isAudience(c)) audience = c; }
  return { preferredTags, audience };
}
