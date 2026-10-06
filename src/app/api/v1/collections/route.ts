import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems, collections } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { fail, json, sameOrigin } from "@/lib/http";
import { toggleInCollection } from "@/lib/collections";

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** 自分のコレクション一覧。video を指定すると、その動画が各コレクションに入っているかも返す */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return fail("UNAUTH", "ログインが必要です", 401);
  const conn = await db();
  const video = new URL(req.url).searchParams.get("video") ?? "";
  const cols = await conn.select({
    id: collections.id, name: collections.name,
    count: sql<number>`(select count(*) from collection_items ci where ci.collection_id = ${collections.id})::int`,
  }).from(collections).where(eq(collections.userId, u.id)).orderBy(desc(collections.createdAt));
  let has: string[] = [];
  if (isUuid(video) && cols.length) {
    const rows = await conn.select({ id: collectionItems.collectionId }).from(collectionItems)
      .where(and(eq(collectionItems.videoId, video), inArray(collectionItems.collectionId, cols.map((c) => c.id))));
    has = rows.map((r) => r.id);
  }
  return json({ collections: cols.map((c) => ({ ...c, has: has.includes(c.id) })) });
}

/** 動画をコレクションに入れる／外す（トグル） */
export async function POST(req: Request) {
  if (!(await sameOrigin())) return fail("BAD_ORIGIN", "不正なリクエストです", 403);
  const u = await currentUser();
  if (!u) return fail("UNAUTH", "ログインが必要です", 401);
  const b = await req.json().catch(() => null) as { collectionId?: string; videoId?: string } | null;
  const r = await toggleInCollection(u.id, String(b?.collectionId ?? ""), String(b?.videoId ?? ""));
  if (!r.ok) return fail("INVALID", r.error ?? "追加できませんでした");
  return json({ added: r.added });
}
