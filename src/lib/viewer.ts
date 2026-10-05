import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { currentUser, regionBlocked, requireAgeGate, viewerKey } from "./auth";
import { isAudience, isIntensity, type Audience } from "./audience";

export type Viewer = Awaited<ReturnType<typeof viewerContext>>;

/** ゲート内のページはすべてここを通す（年齢確認・地域をサーバーで再確認） */
export async function viewerContext() {
  const path = (await headers()).get("x-pathname") ?? "/";
  if (await regionBlocked()) redirect("/unavailable");
  await requireAgeGate(path);
  const user = await currentUser();
  // 成人向けを見せてよい状態か。年齢確認を通していても、運営が制限していれば見せない
  const adultAllowed = user?.ageStatus !== "age_restricted";
  if (!adultAllowed) redirect("/restricted");
  const { preferredTags, audience, maxIntensity } = await readTaste(user?.id ?? null);
  // adultAllowed は、画面を出さないAPI側でも同じ判断ができるように渡す
  return { user, viewerKey: await viewerKey(), preferredTags, audience, maxIntensity, userId: user?.id ?? null, adultAllowed };
}

/** 好み（最初の分岐と好きなタグ）。ログイン中はDB、未ログインはCookie */
export async function readTaste(userId: string | null): Promise<{ preferredTags: string[]; audience: Audience; maxIntensity: number }> {
  let preferredTags: string[] = [];
  let audience: Audience = "all";
  let maxIntensity = 0;
  if (userId) {
    const [p] = await (await db()).select().from(userPreferences).where(eq(userPreferences.userId, userId));
    preferredTags = p?.preferredTags ?? [];
    if (p) { audience = p.audience; maxIntensity = p.maxIntensity; }
  }
  const jar = await cookies();
  if (!preferredTags.length) {
    try { preferredTags = JSON.parse(decodeURIComponent(jar.get("ptags")?.value ?? "[]")); } catch { preferredTags = []; }
  }
  if (audience === "all") { const c = jar.get("aud")?.value; if (isAudience(c)) audience = c; }
  if (!maxIntensity) { const m = Number(jar.get("mi")?.value); maxIntensity = isIntensity(m) ? m : 3; }
  return { preferredTags, audience, maxIntensity };
}
