import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type DB } from "@/db";
import * as s from "@/db/schema";
import { hydrate, type VideoCard } from "./content";
import type { Viewer } from "./viewer";

export type ProfileTab = "posts" | "liked" | "saved" | "private";

export type Profile = {
  id: string; handle: string; displayName: string; avatarHue: number; avatarUrl: string | null;
  bio: string; isCreator: boolean; createdAt: string;
  posts: number; followers: number; following: number; likes: number;
  /** 自分が相手をフォローしているか */
  followed: boolean;
  /** 相手も自分をフォローしているか（TikTok の「友達」表示） */
  followsYou: boolean;
};

const count = (n: { n: number }[]) => n[0]?.n ?? 0;

/** プロフィール1人ぶんの表示データ。handle か id で引く */
export async function profileOf(who: { handle?: string; id?: string }, viewerId: string | null, conn?: DB): Promise<Profile | null> {
  const d = conn ?? (await db());
  const [u] = await d.select().from(s.users).where(
    who.id ? eq(s.users.id, who.id) : eq(s.users.handle, (who.handle ?? "").toLowerCase()),
  );
  if (!u || u.status === "deleted") return null;
  const [cp, posts, followers, following, likeSum, rel] = await Promise.all([
    d.select({ status: s.creatorProfiles.status }).from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, u.id)),
    d.select({ n: sql<number>`count(*)::int` }).from(s.videos).where(and(eq(s.videos.creatorId, u.id), eq(s.videos.status, "published"))),
    d.select({ n: sql<number>`count(*)::int` }).from(s.follows).where(eq(s.follows.creatorId, u.id)),
    d.select({ n: sql<number>`count(*)::int` }).from(s.follows).where(eq(s.follows.followerId, u.id)),
    // 受け取ったいいねの合計（ベースのいいね数も含む）
    d.select({ n: sql<number>`coalesce(sum(${s.videos.likeCount} + ${s.videos.baseLikes}), 0)::int` }).from(s.videos).where(and(eq(s.videos.creatorId, u.id), eq(s.videos.status, "published"))),
    viewerId ? d.select({ a: s.follows.followerId, b: s.follows.creatorId }).from(s.follows)
      .where(sql`(${s.follows.followerId} = ${viewerId} and ${s.follows.creatorId} = ${u.id}) or (${s.follows.followerId} = ${u.id} and ${s.follows.creatorId} = ${viewerId})`)
      : Promise.resolve([] as { a: string; b: string }[]),
  ]);
  return {
    id: u.id, handle: u.handle, displayName: u.displayName, avatarHue: u.avatarHue, avatarUrl: u.avatarUrl,
    bio: u.bio, isCreator: cp[0]?.status === "approved", createdAt: u.createdAt.toISOString(),
    posts: count(posts), followers: count(followers), following: count(following), likes: count(likeSum),
    followed: rel.some((r) => r.a === viewerId), followsYou: rel.some((r) => r.b === viewerId),
  };
}

/** プロフィールのタブごとの動画一覧 */
export async function profileVideos(tab: ProfileTab, p: Profile, v: Viewer, limit = 60): Promise<VideoCard[]> {
  const d = await db();
  if (tab === "posts" || tab === "private") {
    const rows = await d.select({ id: s.videos.id }).from(s.videos)
      .where(and(eq(s.videos.creatorId, p.id), tab === "posts" ? eq(s.videos.status, "published") : inArray(s.videos.status, ["pending_review", "rejected", "hidden_by_creator", "hidden_by_report"])))
      .orderBy(desc(s.videos.publishedAt), desc(s.videos.createdAt)).limit(limit);
    return hydrate(rows.map((r) => r.id), v, d, tab === "private");
  }
  const t = tab === "liked" ? s.likes : s.favorites;
  const rows = await d.select({ id: t.videoId }).from(t).where(eq(t.viewerKey, v.viewerKey)).orderBy(desc(t.createdAt)).limit(limit);
  return hydrate(rows.map((r) => r.id), v, d);
}

/** 未読のお知らせの件数（下のバーのバッジ用） */
export async function unreadCount(userId: string | null, conn?: DB): Promise<number> {
  if (!userId) return 0;
  const d = conn ?? (await db());
  const [r] = await d.select({ n: sql<number>`count(*)::int` }).from(s.notifications)
    .where(and(eq(s.notifications.userId, userId), sql`${s.notifications.readAt} is null`));
  return r?.n ?? 0;
}

export type PersonRow = { id: string; handle: string; displayName: string; avatarHue: number; avatarUrl: string | null; bio: string; followed: boolean };

/** フォロー中・フォロワーの一覧 */
export async function peopleOf(userId: string, kind: "followers" | "following", viewerId: string | null): Promise<PersonRow[]> {
  const d = await db();
  const [me, them] = kind === "followers" ? [s.follows.creatorId, s.follows.followerId] : [s.follows.followerId, s.follows.creatorId];
  const rows = await d.select({ id: s.users.id, handle: s.users.handle, displayName: s.users.displayName, avatarHue: s.users.avatarHue, avatarUrl: s.users.avatarUrl, bio: s.users.bio })
    .from(s.follows).innerJoin(s.users, eq(s.users.id, them))
    .where(and(eq(me, userId), eq(s.users.status, "active"))).orderBy(desc(s.follows.createdAt)).limit(200);
  if (!rows.length) return rows.map((r) => ({ ...r, followed: false }));
  const mine = viewerId
    ? new Set((await d.select({ id: s.follows.creatorId }).from(s.follows).where(and(eq(s.follows.followerId, viewerId), inArray(s.follows.creatorId, rows.map((r) => r.id))))).map((r) => r.id))
    : new Set<string>();
  return rows.map((r) => ({ ...r, followed: mine.has(r.id) }));
}

/** おすすめの投稿者（フォローしていない人から、フォロワーの多い順） */
export async function suggestedCreators(viewerId: string | null, limit = 10): Promise<PersonRow[]> {
  const d = await db();
  const rows = await d.select({
    id: s.users.id, handle: s.users.handle, displayName: s.users.displayName, avatarHue: s.users.avatarHue, avatarUrl: s.users.avatarUrl, bio: s.users.bio,
    n: sql<number>`(select count(*) from follows f where f.creator_id = ${s.users.id})::int`.as("n"),
  }).from(s.users).innerJoin(s.creatorProfiles, eq(s.creatorProfiles.userId, s.users.id))
    .where(and(eq(s.creatorProfiles.status, "approved"), eq(s.users.status, "active")))
    .orderBy(desc(sql`"n"`)).limit(limit + 10);
  const mine = viewerId
    ? new Set((await d.select({ id: s.follows.creatorId }).from(s.follows).where(eq(s.follows.followerId, viewerId))).map((r) => r.id))
    : new Set<string>();
  return rows.filter((r) => r.id !== viewerId && !mine.has(r.id)).slice(0, limit).map(({ n, ...r }) => { void n; return { ...r, followed: false }; });
}
