import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, users } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { contentGuard, fail, json, rateLimit } from "@/lib/http";
import { postComment } from "@/lib/moderation";
import { getSetting } from "@/lib/settings";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await contentGuard();
  if (blocked) return blocked;
  const { id } = await params;
  const me = await currentUser();
  const rows = await (await db()).select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, userId: comments.userId, handle: users.handle, avatarHue: users.avatarHue })
    .from(comments).innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.videoId, id), eq(comments.status, "visible"))).orderBy(desc(comments.createdAt)).limit(100);
  return json({ comments: rows.map(({ userId, ...r }) => ({ ...r, mine: me?.id === userId })) });
}

const Body = z.object({ body: z.string().min(1).max(300) });

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
  const r = await postComment(await db(), { videoId: (await params).id, userId: me.id, body: parsed.data.body });
  if (!r.ok) return fail("INVALID", r.error);
  return json({ pending: r.pending, comment: { id: r.comment.id, body: r.comment.body, createdAt: r.comment.createdAt, handle: me.handle, avatarHue: me.avatarHue, mine: true } });
}
