import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems, collections } from "@/db/schema";

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** プロフィール上部に固定できる最大本数（TikTok と同じく3本） */
export const MAX_PINNED = 3;

/** 動画をコレクションに入れる／外す（トグル） */
export async function toggleInCollection(userId: string, collectionId: string, videoId: string): Promise<{ ok: boolean; added?: boolean; error?: string }> {
  if (!isUuid(collectionId) || !isUuid(videoId)) return { ok: false, error: "不正な指定です" };
  const conn = await db();
  const [col] = await conn.select({ id: collections.id }).from(collections).where(and(eq(collections.id, collectionId), eq(collections.userId, userId)));
  if (!col) return { ok: false, error: "コレクションが見つかりません" };
  const [exists] = await conn.select({ v: collectionItems.videoId }).from(collectionItems)
    .where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.videoId, videoId)));
  if (exists) {
    await conn.delete(collectionItems).where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.videoId, videoId)));
    return { ok: true, added: false };
  }
  await conn.insert(collectionItems).values({ collectionId, videoId }).onConflictDoNothing();
  return { ok: true, added: true };
}

/** 自分のコレクション一覧（件数つき） */
export async function myCollections(userId: string) {
  const conn = await db();
  return conn.select({
    id: collections.id, name: collections.name, createdAt: collections.createdAt,
    count: sql<number>`(select count(*) from collection_items ci where ci.collection_id = ${collections.id})::int`,
  }).from(collections).where(eq(collections.userId, userId)).orderBy(desc(collections.createdAt));
}
