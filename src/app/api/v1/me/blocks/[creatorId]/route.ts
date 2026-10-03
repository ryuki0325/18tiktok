import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { blocks, users } from "@/db/schema";
import { viewerKey } from "@/lib/auth";
import { contentGuard, fail, json } from "@/lib/http";

async function handle(creatorId: string, on: boolean) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const key = await viewerKey();
  if (key === "d:anon") return fail("NO_DEVICE", "もう一度お試しください", 400);
  const conn = await db();
  const [u] = await conn.select({ id: users.id }).from(users).where(eq(users.id, creatorId));
  if (!u) return fail("NOT_FOUND", "投稿者が見つかりません", 404);
  if (on) await conn.insert(blocks).values({ viewerKey: key, creatorId }).onConflictDoNothing();
  else await conn.delete(blocks).where(and(eq(blocks.viewerKey, key), eq(blocks.creatorId, creatorId)));
  return json({ blocked: on });
}
export async function PUT(_: Request, { params }: { params: Promise<{ creatorId: string }> }) { return handle((await params).creatorId, true); }
export async function DELETE(_: Request, { params }: { params: Promise<{ creatorId: string }> }) { return handle((await params).creatorId, false); }
