import { cookies } from "next/headers";
import { contentGuard, fail, json, rateLimit } from "@/lib/http";
import { feed, type FeedTab } from "@/lib/content";
import { currentUser, viewerKey } from "@/lib/auth";

export async function GET(req: Request) {
  const blocked = await contentGuard();
  if (blocked) return blocked;
  const sp = new URL(req.url).searchParams;
  const t = sp.get("tab");
  const offset = Math.max(0, Math.min(1000, Number(sp.get("offset")) || 0));
  const limit = 8;
  const tab: FeedTab = t === "popular" || t === "following" ? t : "recommended";
  const user = await currentUser();
  const key = await viewerKey();
  if (!(await rateLimit(`feed:${key}`, 300, 3600))) return fail("RATE_LIMITED", "しばらくしてからお試しください", 429);
  let preferredTags: string[] = [];
  try { preferredTags = JSON.parse(decodeURIComponent((await cookies()).get("ptags")?.value ?? "[]")); } catch {}
  const videos = await feed(tab, { viewerKey: key, userId: user?.id ?? null, preferredTags }, limit, offset);
  return json({ videos, nextOffset: videos.length === limit ? offset + limit : null });
}
