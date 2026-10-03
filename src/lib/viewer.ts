import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { currentUser, regionBlocked, requireAgeGate, viewerKey } from "./auth";

/** ゲート内のページはすべてここを通す（年齢確認・地域をサーバーで再確認） */
export async function viewerContext() {
  const path = (await headers()).get("x-pathname") ?? "/";
  if (await regionBlocked()) redirect("/unavailable");
  await requireAgeGate(path);
  const user = await currentUser();
  let preferredTags: string[] = [];
  if (user) {
    const [p] = await (await db()).select().from(userPreferences).where(eq(userPreferences.userId, user.id));
    preferredTags = p?.preferredTags ?? [];
  }
  if (!preferredTags.length) {
    try { preferredTags = JSON.parse(decodeURIComponent((await cookies()).get("ptags")?.value ?? "[]")); } catch { preferredTags = []; }
  }
  return { user, viewerKey: await viewerKey(), preferredTags, userId: user?.id ?? null };
}
