import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { creatorProfiles, follows } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { contentGuard, fail, json } from "@/lib/http";

async function handle(id: string, on: boolean) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const u = await currentUser();
  if (!u) return fail("LOGIN_REQUIRED", "ログインが必要です", 401);
  if (u.id === id) return fail("SELF", "自分はフォローできません");
  const conn = await db();
  const [c] = await conn.select().from(creatorProfiles).where(and(eq(creatorProfiles.userId, id), eq(creatorProfiles.status, "approved")));
  if (!c) return fail("NOT_FOUND", "投稿者が見つかりません", 404);
  if (on) await conn.insert(follows).values({ followerId: u.id, creatorId: id }).onConflictDoNothing();
  else await conn.delete(follows).where(and(eq(follows.followerId, u.id), eq(follows.creatorId, id)));
  return json({ following: on });
}
export async function PUT(_: Request, { params }: { params: Promise<{ id: string }> }) { return handle((await params).id, true); }
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { return handle((await params).id, false); }
