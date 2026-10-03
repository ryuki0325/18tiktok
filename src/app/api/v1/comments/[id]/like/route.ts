import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { commentLikes, comments } from "@/db/schema";
import { viewerKey } from "@/lib/auth";
import { contentGuard, fail, json } from "@/lib/http";
import { isUuid } from "@/lib/media";

/** コメントへのいいね（ログインしていなくても、この端末ぶんは押せる） */
async function handle(id: string, on: boolean) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  if (!isUuid(id)) return fail("NOT_FOUND", "コメントが見つかりません", 404);
  const key = await viewerKey();
  const conn = await db();
  const [c] = await conn.select({ id: comments.id }).from(comments).where(and(eq(comments.id, id), eq(comments.status, "visible")));
  if (!c) return fail("NOT_FOUND", "コメントが見つかりません", 404);
  if (on) await conn.insert(commentLikes).values({ viewerKey: key, commentId: id }).onConflictDoNothing();
  else await conn.delete(commentLikes).where(and(eq(commentLikes.viewerKey, key), eq(commentLikes.commentId, id)));
  return json({ liked: on });
}
export async function PUT(_: Request, { params }: { params: Promise<{ id: string }> }) { return handle((await params).id, true); }
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { return handle((await params).id, false); }
