import "server-only";
import { eq } from "drizzle-orm";
import { db, type DB } from "@/db";
import { siteSettings } from "@/db/schema";

/** 管理画面から変えられる設定値（初期値）。docs/03 §2.8 */
export const DEFAULT_SETTINGS = {
  "age_gate.ttl_days": 30,
  "age_gate.version": 1,
  "review.new_creator_full_review_count": 5,
  "report.auto_hide_threshold.unauthorized_repost": 3,
  "report.auto_hide_threshold.inappropriate": 3,
  "report.auto_hide_threshold.other": 5,
  "report.sla_hours": { P0: 24, P1: 72, P2: 168 },
  "comments.auto_hide_threshold": 3,
  "comments.rate_limit_per_hour": 20,
  "clicks.dedupe_window_sec": 1800,
  "ranking.popular_formula": { wViews: 1, wClicks: 3, wLikes: 2, halfLifeHours: 48 },
  "operator.display_mode": "contact_only",
  "operator.contact_email": "contact@example.com",
  "operator.name": "",
  "geo.blocked_regions": [] as string[],
  "ng_words": ["死ね", "殺す", "未成年", "JK", "JC", "ロリ"],
  "shortener_domains": ["bit.ly", "t.co", "goo.gl", "tinyurl.com", "ow.ly", "is.gd", "buff.ly", "x.gd", "lnkd.in", "rebrand.ly", "cutt.ly", "shorturl.at"],
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
type Widen<T> = T extends readonly (infer U)[] ? U[] : T extends number ? number : T extends string ? string : T;
export type SettingValue<K extends SettingKey> = Widen<(typeof DEFAULT_SETTINGS)[K]>;

export async function getSetting<K extends SettingKey>(key: K, d?: DB): Promise<SettingValue<K>> {
  const conn = d ?? (await db());
  const [row] = await conn.select().from(siteSettings).where(eq(siteSettings.key, key));
  return (row ? row.value : DEFAULT_SETTINGS[key]) as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>, d?: DB) {
  const conn = d ?? (await db());
  await conn.insert(siteSettings).values({ key, value }).onConflictDoUpdate({
    target: siteSettings.key, set: { value, updatedAt: new Date() },
  });
}
