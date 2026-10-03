import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, videos } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { contentGuard, fail, json } from "@/lib/http";

/** 書いた本人は削除、動画の投稿者は非表示にできる */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const me = await currentUser();
  if (!me) return fail("LOGIN_REQUIRED", "ログインが必要です", 401);
  const conn = await db();
  const { id } = await params;
  const [c] = await conn.select({ c: comments, creatorId: videos.creatorId }).from(comments).innerJoin(videos, eq(videos.id, comments.videoId)).where(eq(comments.id, id));
  if (!c) return fail("NOT_FOUND", "コメントが見つかりません", 404);
  if (c.c.userId === me.id) await conn.update(comments).set({ status: "removed" }).where(eq(comments.id, id));
  else if (c.creatorId === me.id) await conn.update(comments).set({ status: "hidden_by_creator" }).where(and(eq(comments.id, id), eq(comments.status, "visible")));
  else return fail("FORBIDDEN", "削除できません", 403);
  return json({ ok: true });
}
