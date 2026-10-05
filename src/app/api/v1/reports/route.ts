import { z } from "zod";
import { db } from "@/db";
import { REPORT_REASONS, REPORT_TARGETS } from "@/db/schema";
import { currentUser, viewerKey } from "@/lib/auth";
import { contentGuard, clientIpHash, fail, json, rateLimit } from "@/lib/http";
import { fileReport } from "@/lib/safety";

const Body = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  description: z.string().trim().max(1000).optional(),
});

/**
 * 通報の受付（動画・プロフィール・コメント共通）。
 * ログインしていなくても通報できる。通報した人が投稿者に知られることはない。
 */
export async function POST(req: Request) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("INVALID", "通報の内容が正しくありません");

  const me = await currentUser();
  const key = await viewerKey();
  // 連続通報による嫌がらせ・負荷を防ぐ。端末とIPの両方で見る
  if (!(await rateLimit(`report:${key}`, 20, 3600))) return fail("RATE_LIMITED", "通報が多すぎます。しばらくしてからお試しください", 429);
  if (!(await rateLimit(`report-ip:${await clientIpHash()}`, 60, 3600))) return fail("RATE_LIMITED", "通報が多すぎます。しばらくしてからお試しください", 429);

  const r = await fileReport(await db(), {
    ...p.data, reporterKey: key, reporterId: me?.id ?? null,
  });
  if (!r.ok) return fail("INVALID", r.error);
  return json({ duplicate: r.duplicate, hidden: r.hidden });
}
