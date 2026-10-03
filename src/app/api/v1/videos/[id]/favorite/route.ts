import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { favorites, videos } from "@/db/schema";
import { viewerKey } from "@/lib/auth";
import { contentGuard, fail, json } from "@/lib/http";

async function handle(id: string, on: boolean) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const key = await viewerKey();
  const conn = await db();
  const [v] = await conn.select({ id: videos.id }).from(videos).where(and(eq(videos.id, id), eq(videos.status, "published")));
  if (!v) return fail("NOT_FOUND", "動画が見つかりません", 404);
  if (on) await conn.insert(favorites).values({ viewerKey: key, videoId: id }).onConflictDoNothing();
  else await conn.delete(favorites).where(and(eq(favorites.viewerKey, key), eq(favorites.videoId, id)));
  return json({ saved: on });
}
export async function PUT(_: Request, { params }: { params: Promise<{ id: string }> }) { return handle((await params).id, true); }
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { return handle((await params).id, false); }
