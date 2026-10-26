import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type DB } from "@/db";
import { promos } from "@/db/schema";

export type Promo = typeof promos.$inferSelect;
/** フィードに渡す表示用（html/targetUrl は必要なものだけ・内部情報は出さない） */
export type FeedPromo = {
  id: string; kind: "affiliate" | "network" | "sponsor";
  title: string; body: string; imageUrl: string | null; embedUrl: string | null; videoUrl: string | null; ctaText: string; label: string; html: string | null;
};

/** フィードに差し込む有効なプロモ（重みの大きい順）。視聴者の分岐に合うものだけ。 */
export async function getFeedPromos(audience?: string, conn?: DB): Promise<FeedPromo[]> {
  const c = conn ?? (await db());
  const cats = (audience && audience !== "all" ? ["all", audience] : ["all"]) as ("all" | "women" | "men" | "gay" | "lesbian")[];
  const rows = await c.select().from(promos)
    .where(and(eq(promos.active, true), inArray(promos.category, cats)))
    .orderBy(desc(promos.weight), desc(promos.createdAt)).limit(20);
  // network は html を渡す。affiliate/sponsor は html を渡さない（クリックは /api/v1/promo で記録）
  return rows.map((p) => ({
    id: p.id, kind: p.kind, title: p.title, body: p.body, imageUrl: p.imageUrl,
    embedUrl: p.kind === "network" ? null : p.embedUrl, videoUrl: p.kind === "network" ? null : p.videoUrl,
    ctaText: p.ctaText, label: p.label, html: p.kind === "network" ? p.html : null,
  }));
}

const isHttps = (u: string) => { try { const x = new URL(u); return x.protocol === "https:"; } catch { return false; } };

/**
 * クリックを処理し、安全な遷移先URLを返す（network はクリック記録しない）。
 * count=false（bot 等）のときは、URLは返すが集計は増やさない。
 */
export async function recordPromoClick(id: string, count = true): Promise<string | null> {
  const conn = await db();
  const [p] = await conn.select({ kind: promos.kind, targetUrl: promos.targetUrl, active: promos.active }).from(promos).where(eq(promos.id, id));
  if (!p || !p.active || p.kind === "network" || !p.targetUrl || !isHttps(p.targetUrl)) return null;
  if (count) await conn.update(promos).set({ clicks: sql`${promos.clicks} + 1` }).where(eq(promos.id, id));
  return p.targetUrl;
}

/** 表示回数を記録（効果測定用。失敗しても無視） */
export async function recordPromoImpression(id: string): Promise<void> {
  const conn = await db();
  await conn.update(promos).set({ impressions: sql`${promos.impressions} + 1` }).where(eq(promos.id, id)).catch(() => {});
}
