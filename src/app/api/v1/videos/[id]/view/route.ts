import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { videos, views, watchHistory } from "@/db/schema";
import { currentUser, viewerKey } from "@/lib/auth";
import { contentGuard, fail, isBotUa, json, rateLimit } from "@/lib/http";

/** 再生の記録。同じ端末の同じ動画は30分に1回、botと投稿者本人は無効として残す */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const { id } = await params;
  const key = await viewerKey();
  if (!(await rateLimit(`view:${key}`, 240, 3600))) return fail("RATE_LIMITED", "しばらくしてからお試しください", 429);
  const conn = await db();
  const [v] = await conn.select({ creatorId: videos.creatorId, status: videos.status }).from(videos).where(eq(videos.id, id));
  if (!v || v.status !== "published") return fail("NOT_FOUND", "動画が見つかりません", 404);
  // 視聴履歴（ログイン中の人だけ）。再生数とは別に、最後に見た日時を上書きする
  const me = await currentUser();
  if (me) {
    await conn.insert(watchHistory).values({ userId: me.id, videoId: id })
      .onConflictDoUpdate({ target: [watchHistory.userId, watchHistory.videoId], set: { viewedAt: new Date() } });
  }
  const [recent] = await conn.select({ id: views.id }).from(views)
    .where(and(eq(views.videoId, id), eq(views.viewerKey, key), gt(views.createdAt, new Date(Date.now() - 30 * 60_000)))).limit(1);
  if (recent) return json({ counted: false });
  const valid = !isBotUa((await headers()).get("user-agent")) && key !== `u:${v.creatorId}`;
  await conn.insert(views).values({ videoId: id, viewerKey: key, isValid: valid });
  return json({ counted: valid });
}
