import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { outboundLinks, videos } from "@/db/schema";
import { viewerKey } from "@/lib/auth";
import { contentGuard, fail, isBotUa, json, rateLimit } from "@/lib/http";
import { recordClick } from "@/lib/moderation";

/** 「移動する」を押したときに呼ぶ。クリックを記録してから移動先URLを返す */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const { id } = await params;
  const key = await viewerKey();
  const conn = await db();
  const [l] = await conn.select({ creatorId: videos.creatorId }).from(outboundLinks).innerJoin(videos, eq(videos.id, outboundLinks.videoId)).where(eq(outboundLinks.id, id));
  if (!l) return fail("GONE", "このリンクは現在利用できません", 410);
  const limited = !(await rateLimit(`click:${key}`, 60, 3600));
  const r = await recordClick(conn, { linkId: id, viewerKey: key, isBot: limited || isBotUa((await headers()).get("user-agent")), creatorKey: `u:${l.creatorId}` });
  if (!r) return fail("GONE", "このリンクは現在利用できません", 410);
  return json({ url: r.url });
}
