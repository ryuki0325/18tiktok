import { z } from "zod";
import { db } from "@/db";
import { REPORT_REASONS } from "@/db/schema";
import { viewerKey } from "@/lib/auth";
import { clientIpHash, contentGuard, fail, json, rateLimit } from "@/lib/http";
import { fileReport } from "@/lib/moderation";

const Body = z.object({ reason: z.enum(REPORT_REASONS), detail: z.string().max(1000).optional() });

/** 通報（ログイン不要）。端末とIPでレート制限、同じ動画への重複は数えない */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("INVALID", "通報の理由を選んでください");
  if (parsed.data.reason === "other" && !parsed.data.detail?.trim()) return fail("INVALID", "「その他」の場合は詳しい内容を入力してください");
  const key = await viewerKey();
  const ip = await clientIpHash();
  if (!(await rateLimit(`report:${key}`, 10, 3600)) || !(await rateLimit(`report-ip:${ip}`, 30, 3600))) return fail("RATE_LIMITED", "通報の回数が多すぎます。しばらくしてからお試しください", 429);
  const r = await fileReport(await db(), { videoId: (await params).id, reason: parsed.data.reason, detail: parsed.data.detail?.trim(), reporterKey: key });
  if (!r.ok) return fail("NOT_FOUND", r.error, 404);
  return json({ hidden: r.hidden, duplicate: r.duplicate });
}
