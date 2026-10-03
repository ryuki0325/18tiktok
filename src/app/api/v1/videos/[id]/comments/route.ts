import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { commentLikes, comments, users } from "@/db/schema";
import { currentUser, viewerKey } from "@/lib/auth";
import { contentGuard, fail, json, rateLimit } from "@/lib/http";
import { postComment } from "@/lib/moderation";
import { getSetting } from "@/lib/settings";
import { isUuid } from "@/lib/media";

const TOP = 60;      // 最初に出すコメントの数
const REPLIES = 3;   // 1件あたり、最初に見せる返信の数

/**
 * コメント一覧（TikTokと同じ2段構成）。
 * 新着のコメントを上から並べ、それぞれの返信は古い順に少しだけ。残りは「返信をもっと見る」で読む。
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await contentGuard();
  if (blocked) return blocked;
  const { id } = await params;
  if (!isUuid(id)) return fail("NOT_FOUND", "動画が見つかりません", 404);
  const parent = new URL(req.url).searchParams.get("parent");
  const [me, key, conn] = await Promise.all([currentUser(), viewerKey(), db()]);

  const pick = {
    id: comments.id, body: comments.body, createdAt: comments.createdAt, userId: comments.userId, parentId: comments.parentId,
    likes: comments.likeCount, handle: users.handle, avatarHue: users.avatarHue, avatarUrl: users.avatarUrl,
  };
  const base = and(eq(comments.videoId, id), eq(comments.status, "visible"));

  // 「返信をもっと見る」：1件ぶんの返信をすべて返す
  if (parent) {
    if (!isUuid(parent)) return fail("NOT_FOUND", "コメントが見つかりません", 404);
    const rows = await conn.select(pick).from(comments).innerJoin(users, eq(users.id, comments.userId))
      .where(and(base, eq(comments.parentId, parent))).orderBy(asc(comments.createdAt)).limit(200);
    return json({ replies: await decorate(rows, me?.id, key) });
  }

  const tops = await conn.select(pick).from(comments).innerJoin(users, eq(users.id, comments.userId))
    .where(and(base, isNull(comments.parentId))).orderBy(desc(comments.createdAt)).limit(TOP);
  if (!tops.length) return json({ comments: [] });

  const ids = tops.map((t) => t.id);
  const [replies, counts] = await Promise.all([
    conn.select(pick).from(comments).innerJoin(users, eq(users.id, comments.userId))
      .where(and(base, inArray(comments.parentId, ids))).orderBy(asc(comments.createdAt)).limit(TOP * REPLIES),
    conn.select({ parentId: comments.parentId, n: sql<number>`count(*)::int` }).from(comments)
      .where(and(base, inArray(comments.parentId, ids))).groupBy(comments.parentId),
  ]);
  const n = new Map(counts.map((c) => [c.parentId, c.n]));
  const all = await decorate([...tops, ...replies], me?.id, key);
  const byId = new Map(all.map((c) => [c.id, c]));
  return json({
    comments: tops.map((t) => ({
      ...byId.get(t.id)!,
      replyCount: n.get(t.id) ?? 0,
      replies: replies.filter((r) => r.parentId === t.id).slice(0, REPLIES).map((r) => byId.get(r.id)!),
    })),
  });
}

type Row = { id: string; body: string; createdAt: Date; userId: string; parentId: string | null; likes: number; handle: string; avatarHue: number; avatarUrl: string | null };

/** 自分が書いたか・自分がいいねしたかを付ける */
async function decorate(rows: Row[], meId: string | undefined, key: string) {
  if (!rows.length) return [];
  const conn = await db();
  const mine = new Set((await conn.select({ id: commentLikes.commentId }).from(commentLikes)
    .where(and(eq(commentLikes.viewerKey, key), inArray(commentLikes.commentId, rows.map((r) => r.id))))).map((r) => r.id));
  return rows.map(({ userId, ...r }) => ({ ...r, mine: meId === userId, liked: mine.has(r.id) }));
}

const Body = z.object({ body: z.string().min(1).max(300), parentId: z.string().uuid().nullish() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const me = await currentUser();
  if (!me) return fail("LOGIN_REQUIRED", "コメントするにはログインしてください", 401);
  if (!me.emailVerifiedAt) return fail("EMAIL_UNVERIFIED", "メールアドレスの確認後にコメントできます", 403);
  if (me.status !== "active") return fail("FORBIDDEN", "現在コメントできません", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("INVALID", "コメントは1〜300文字で入力してください");
  const perHour = await getSetting("comments.rate_limit_per_hour");
  if (!(await rateLimit(`comment:${me.id}`, perHour, 3600))) return fail("RATE_LIMITED", "コメントの回数が多すぎます。しばらくしてからお試しください", 429);
  const r = await postComment(await db(), { videoId: (await params).id, userId: me.id, body: parsed.data.body, parentId: parsed.data.parentId });
  if (!r.ok) return fail("INVALID", r.error);
  return json({
    pending: r.pending,
    comment: {
      id: r.comment.id, body: r.comment.body, createdAt: r.comment.createdAt, parentId: r.comment.parentId,
      likes: 0, liked: false, handle: me.handle, avatarHue: me.avatarHue, avatarUrl: me.avatarUrl, mine: true, replyCount: 0, replies: [],
    },
  });
}
