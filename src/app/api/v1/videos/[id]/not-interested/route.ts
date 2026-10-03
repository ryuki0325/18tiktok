import { db } from "@/db";
import { notInterested } from "@/db/schema";
import { viewerKey } from "@/lib/auth";
import { contentGuard, fail, json } from "@/lib/http";
import { isUuid } from "@/lib/media";

/** 「興味がない」：この端末（ログイン中ならアカウント）のフィードに出さない */
export async function PUT(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const { id } = await params;
  if (!isUuid(id)) return fail("NOT_FOUND", "動画が見つかりません", 404);
  await (await db()).insert(notInterested).values({ viewerKey: await viewerKey(), videoId: id }).onConflictDoNothing();
  return json({ ok: true });
}
