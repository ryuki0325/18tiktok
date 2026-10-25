import { db } from "@/db";
import { viewerKey } from "@/lib/auth";
import { contentGuard, fail, json, rateLimit, sameOrigin } from "@/lib/http";
import { recordPromoClick, recordPromoImpression } from "@/lib/promos";

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * プロモ枠（広告・アフィリ）のクリック／表示の記録。
 * - event=click：クリックを記録し、遷移先URLを返す（＝「本編を見る」の広告版）
 * - event=impression：表示回数を記録（効果測定用）
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  if (!(await sameOrigin())) return fail("BAD_ORIGIN", "不正なリクエストです", 403);
  const { id } = await params;
  if (!isUuid(id)) return fail("NOT_FOUND", "見つかりません", 404);
  const key = await viewerKey();
  const body = (await req.json().catch(() => ({}))) as { event?: string };

  if (body.event === "impression") {
    if (await rateLimit(`promoimp:${key}`, 600, 3600)) await recordPromoImpression(id);
    return json({ ok: true });
  }
  // click
  if (!(await rateLimit(`promoclick:${key}`, 120, 3600))) return fail("RATE_LIMITED", "しばらくしてからお試しください", 429);
  const url = await recordPromoClick(id);
  if (!url) return fail("GONE", "この広告は現在利用できません", 410);
  return json({ url });
}
