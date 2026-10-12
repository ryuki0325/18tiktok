import type { MetadataRoute } from "next";

/**
 * 検索エンジンに載せてよいのは、年齢確認の外にある法務ページだけ（robots.ts と同じ方針）。
 * サイトのURLは APP_URL から。未設定ならサイトマップは空（相対URLはサイトマップに使えないため）。
 */
const LEGAL = ["terms", "privacy", "guidelines", "takedown-policy", "post-consent", "operator", "tokushoho"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  if (!base) return [];
  const now = new Date();
  return LEGAL.map((slug) => ({ url: `${base}/legal/${slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.5 }));
}
