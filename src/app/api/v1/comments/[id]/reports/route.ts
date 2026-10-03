import { z } from "zod";
import { db } from "@/db";
import { viewerKey } from "@/lib/auth";
import { contentGuard, fail, json, rateLimit } from "@/lib/http";
import { reportComment } from "@/lib/moderation";

const Body = z.object({ reason: z.enum(["harassment", "personal_info", "spam", "minor_related", "other"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("INVALID", "理由を選んでください");
  const key = await viewerKey();
  if (!(await rateLimit(`creport:${key}`, 20, 3600))) return fail("RATE_LIMITED", "しばらくしてからお試しください", 429);
  return json(await reportComment(await db(), { commentId: (await params).id, reason: parsed.data.reason, reporterKey: key }));
}
