import "server-only";
import { and, desc, eq, gte, inArray, sql, lte } from "drizzle-orm";
import { db, type DB } from "@/db";
import * as s from "@/db/schema";
import { getSetting } from "./settings";
import type { Audience, VideoCategory } from "./audience";

export type VideoCard = {
  id: string; title: string; description: string; hue: [number, number, number];
  creator: { id: string; handle: string; avatarHue: number; avatarUrl: string | null };
  tags: string[]; likes: number; comments: number; views: number; clicks: number;
  link: { id: string; domain: string } | null; liked: boolean; saved: boolean; following: boolean;
  publishedAt: string | null; commentsEnabled: boolean;
  /** 動画ファイルのURL（CDN上の HLS .m3u8 または MP4）。未アップロードなら null で、抽象プレースホルダーを表示 */
  src: string | null;
  poster: string | null;
  /** 縦横のピクセル数。横長（width > height）は切らずに全体を表示する */
  width: number | null;
  height: number | null;
  category: VideoCategory;
  intensity: number;
  /** 公開状態（自分の投稿一覧で「審査中」などを出すため） */
  status: string;
};

type Opts = { viewerKey: string; userId?: string | null; preferredTags?: string[]; audience?: Audience; maxIntensity?: number };

/** 動画IDの一覧から表示用データを組み立てる（公開中のものだけ） */
export async function hydrate(ids: string[], o: Opts, conn?: DB, includeUnpublished = false): Promise<VideoCard[]> {
  if (!ids.length) return [];
  const d = conn ?? (await db());
  const rows = await d.select({ v: s.videos, handle: s.users.handle, avatarHue: s.users.avatarHue, avatarUrl: s.users.avatarUrl })
    .from(s.videos).innerJoin(s.users, eq(s.users.id, s.videos.creatorId))
    .where(includeUnpublished ? inArray(s.videos.id, ids) : and(inArray(s.videos.id, ids), eq(s.videos.status, "published")));
  // いいね数・再生数は videos の列（トリガーで増減）から読む。コメント・クリックは件数が少ないので集計
  const [tagRows, commentRows, clickRows, linkRows, myLikes, mySaves, myFollows, myBlocks] = await Promise.all([
    d.select({ videoId: s.videoTags.videoId, name: s.tags.name }).from(s.videoTags).innerJoin(s.tags, eq(s.tags.id, s.videoTags.tagId)).where(inArray(s.videoTags.videoId, ids)),
    d.select({ videoId: s.comments.videoId, n: sql<number>`count(*)::int` }).from(s.comments).where(and(inArray(s.comments.videoId, ids), eq(s.comments.status, "visible"))).groupBy(s.comments.videoId),
    d.select({ videoId: s.linkClicks.videoId, n: sql<number>`count(*)::int` }).from(s.linkClicks).where(and(inArray(s.linkClicks.videoId, ids), eq(s.linkClicks.isValid, true))).groupBy(s.linkClicks.videoId),
    d.select().from(s.outboundLinks).where(and(inArray(s.outboundLinks.videoId, ids), eq(s.outboundLinks.status, "active"))),
    d.select({ id: s.likes.videoId }).from(s.likes).where(and(inArray(s.likes.videoId, ids), eq(s.likes.viewerKey, o.viewerKey))),
    d.select({ id: s.favorites.videoId }).from(s.favorites).where(and(inArray(s.favorites.videoId, ids), eq(s.favorites.viewerKey, o.viewerKey))),
    o.userId ? d.select({ id: s.follows.creatorId }).from(s.follows).where(eq(s.follows.followerId, o.userId)) : Promise.resolve([] as { id: string }[]),
    d.select({ id: s.blocks.creatorId }).from(s.blocks).where(eq(s.blocks.viewerKey, o.viewerKey)),
  ]);
  const blocked = new Set(myBlocks.map((r) => r.id));
  const count = (arr: { videoId: string; n: number }[]) => new Map(arr.map((r) => [r.videoId, r.n]));
  const cc = count(commentRows), kc = count(clickRows);
  const liked = new Set(myLikes.map((r) => r.id)), saved = new Set(mySaves.map((r) => r.id)), fol = new Set(myFollows.map((r) => r.id));
  const byId = new Map(rows.map((r) => {
    const v = r.v;
    const link = linkRows.find((l) => l.videoId === v.id);
    const card: VideoCard = {
      id: v.id, title: v.title, description: v.description, hue: v.hue,
      creator: { id: v.creatorId, handle: r.handle, avatarHue: r.avatarHue, avatarUrl: r.avatarUrl },
      tags: tagRows.filter((t) => t.videoId === v.id).map((t) => t.name),
      likes: v.baseLikes + v.likeCount, comments: cc.get(v.id) ?? 0, views: v.viewCount, clicks: kc.get(v.id) ?? 0,
      link: link ? { id: link.id, domain: link.domain } : null,
      liked: liked.has(v.id), saved: saved.has(v.id), following: fol.has(v.creatorId),
      publishedAt: v.publishedAt?.toISOString() ?? null, commentsEnabled: v.commentsEnabled,
      src: v.mediaStatus === "ready" ? v.playbackUrl : null, poster: v.thumbnailUrl, width: v.width, height: v.height, category: v.category, intensity: v.intensity, status: v.status,
    };
    return [v.id, card];
  }));
  // 「表示しない」にした投稿者の動画はどこにも出さない
  return ids.map((id) => byId.get(id)).filter((x): x is VideoCard => !!x && !blocked.has(x.creator.id));
}

export type FeedTab = "recommended" | "popular" | "following";

/**
 * フィード。今は公開中の動画を読み込んでアプリ側で並べる（件数が増えたら rankings_cache に移す）。
 * おすすめ：新しさ × 好みのタグ × フォロー、人気：再生・クリック・いいねを時間で減衰させたスコア
 */
export async function feed(tab: FeedTab, o: Opts, limit = 20, offset = 0): Promise<VideoCard[]> {
  const d = await db();
  // 最初の分岐（女性・男性・カップル）で絞る。フォロー中は分岐に関係なく全部見せる
  const byAudience = tab !== "following" && o.audience && o.audience !== "all" ? eq(s.videos.category, o.audience) : undefined;
  // 刺激の強さの上限（フォロー中も含めて常に守る）
  const byIntensity = o.maxIntensity && o.maxIntensity < 3 ? lte(s.videos.intensity, o.maxIntensity) : undefined;
  let idRows = await d.select({ id: s.videos.id, creatorId: s.videos.creatorId, publishedAt: s.videos.publishedAt, baseLikes: s.videos.baseLikes })
    .from(s.videos).where(and(eq(s.videos.status, "published"), byAudience, byIntensity)).orderBy(desc(s.videos.publishedAt)).limit(300);
  // 「興味がない」にした動画は出さない
  if (o.viewerKey) {
    const ni = new Set((await d.select({ id: s.notInterested.videoId }).from(s.notInterested).where(eq(s.notInterested.viewerKey, o.viewerKey))).map((r) => r.id));
    if (ni.size) idRows = idRows.filter((r) => !ni.has(r.id));
  }
  if (tab === "following") {
    if (!o.userId) return [];
    const f = new Set((await d.select({ id: s.follows.creatorId }).from(s.follows).where(eq(s.follows.followerId, o.userId))).map((r) => r.id));
    idRows = idRows.filter((r) => f.has(r.creatorId));
    return hydrate(idRows.slice(offset, offset + limit).map((r) => r.id), o, d);
  }
  const cards = await hydrate(idRows.map((r) => r.id), o, d);
  const formula = await getSetting("ranking.popular_formula", d);
  const age = (c: VideoCard) => (Date.now() - new Date(c.publishedAt ?? Date.now()).getTime()) / 3600_000;
  const pop = (c: VideoCard) =>
    (formula.wViews * Math.log1p(c.views) + formula.wClicks * Math.log1p(c.clicks) + formula.wLikes * Math.log1p(c.likes)) * 0.5 ** (age(c) / (formula.halfLifeHours * 4));
  const pref = new Set(o.preferredTags ?? []);
  const rec = (c: VideoCard) => (1 + c.tags.filter((t) => pref.has(t)).length * 0.6 + (c.following ? 0.5 : 0)) * 0.5 ** (age(c) / 72) + pop(c) * 0.02;
  const score = tab === "popular" ? pop : rec;
  return cards.sort((a, b) => score(b) - score(a)).slice(offset, offset + limit);
}

export async function videosByTag(tag: string, o: Opts) {
  const d = await db();
  const rows = await d.select({ id: s.videos.id }).from(s.videos)
    .innerJoin(s.videoTags, eq(s.videoTags.videoId, s.videos.id)).innerJoin(s.tags, eq(s.tags.id, s.videoTags.tagId))
    .where(and(eq(s.tags.name, tag), eq(s.videos.status, "published"))).orderBy(desc(s.videos.publishedAt)).limit(60);
  return hydrate(rows.map((r) => r.id), o, d);
}

export async function videosByCreator(creatorId: string, o: Opts) {
  const d = await db();
  const rows = await d.select({ id: s.videos.id }).from(s.videos)
    .where(and(eq(s.videos.creatorId, creatorId), eq(s.videos.status, "published"))).orderBy(desc(s.videos.publishedAt)).limit(60);
  return hydrate(rows.map((r) => r.id), o, d);
}

export async function search(q: string, o: Opts) {
  const d = await db();
  const like = `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;
  const [tagHits, creatorHits, videoRows] = await Promise.all([
    d.select().from(s.tags).where(sql`${s.tags.name} ilike ${like}`).limit(10),
    d.select({ id: s.users.id, handle: s.users.handle, displayName: s.users.displayName, avatarHue: s.users.avatarHue, avatarUrl: s.users.avatarUrl, bio: s.users.bio })
      .from(s.users).innerJoin(s.creatorProfiles, eq(s.creatorProfiles.userId, s.users.id))
      .where(and(sql`(${s.users.handle} ilike ${like} or ${s.users.displayName} ilike ${like})`, eq(s.creatorProfiles.status, "approved"), eq(s.users.status, "active"))).limit(20),
    d.select({ id: s.videos.id }).from(s.videos).where(and(eq(s.videos.status, "published"), sql`(${s.videos.title} ilike ${like} or ${s.videos.description} ilike ${like})`)).orderBy(desc(s.videos.publishedAt)).limit(60),
  ]);
  return { tags: tagHits, creators: creatorHits, videos: await hydrate(videoRows.map((r) => r.id), o, d) };
}

/** 週間ランキング（有効な再生＋クリック×3） */
export async function weeklyRanking(o: Opts, limit = 10) {
  const d = await db();
  const since = new Date(Date.now() - 7 * 86400_000);
  const rows = await d.select({
    id: s.videos.id,
    score: sql<number>`(select count(*) from views vw where vw.video_id = "videos"."id" and vw.is_valid and vw.created_at >= ${since.toISOString()}::timestamptz)
      + 3 * (select count(*) from link_clicks lc where lc.video_id = "videos"."id" and lc.is_valid and lc.created_at >= ${since.toISOString()}::timestamptz)
      + "videos"."base_likes" / 1000`.as("score"),
  })
    .from(s.videos).where(eq(s.videos.status, "published")).orderBy(desc(sql`score`)).limit(limit);
  return hydrate(rows.map((r) => r.id), o, d);
}

/** 「探す」の下に並べる、いま見られている動画 */
export async function trending(o: Opts, limit = 24) {
  const d = await db();
  const rows = await d.select({ id: s.videos.id }).from(s.videos)
    .where(eq(s.videos.status, "published"))
    .orderBy(desc(sql`${s.videos.viewCount} + ${s.videos.likeCount} * 3`), desc(s.videos.publishedAt)).limit(limit);
  return hydrate(rows.map((r) => r.id), o, d);
}

/** 新人枠：承認から30日以内の投稿者 */
export async function rookies() {
  const d = await db();
  return d.select({ id: s.users.id, handle: s.users.handle, avatarHue: s.users.avatarHue }).from(s.creatorProfiles)
    .innerJoin(s.users, eq(s.users.id, s.creatorProfiles.userId))
    .where(and(eq(s.creatorProfiles.status, "approved"), gte(s.creatorProfiles.approvedAt, new Date(Date.now() - 30 * 86400_000)))).limit(12);
}

export async function popularTags() {
  const d = await db();
  return d.select({ name: s.tags.name, n: sql<number>`count(${s.videoTags.videoId})::int` }).from(s.tags)
    .leftJoin(s.videoTags, eq(s.videoTags.tagId, s.tags.id)).groupBy(s.tags.id).orderBy(desc(sql`2`), s.tags.id).limit(16);
}
