import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, type DB } from "@/db";
import * as s from "@/db/schema";
import { hydrate, type VideoCard } from "./content";

/** 自分の視聴履歴（新しく見た順）。公開中の動画だけを表示用データにして返す */
export async function watchHistory(userId: string, o: { viewerKey: string; adultAllowed?: boolean }, limit = 90): Promise<VideoCard[]> {
  const d = await db();
  const rows = await d.select({ videoId: s.watchHistory.videoId }).from(s.watchHistory)
    .where(eq(s.watchHistory.userId, userId)).orderBy(desc(s.watchHistory.viewedAt)).limit(limit);
  if (!rows.length) return [];
  const cards = await hydrate(rows.map((r) => r.videoId), { viewerKey: o.viewerKey, userId, adultAllowed: o.adultAllowed }, d);
  // 見た順を保つ
  const order = new Map(rows.map((r, i) => [r.videoId, i]));
  return cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** 視聴履歴をすべて消す */
export async function clearWatchHistory(conn: DB, userId: string) {
  await conn.delete(s.watchHistory).where(eq(s.watchHistory.userId, userId));
}
