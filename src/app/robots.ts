import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return {
    // /v/（共有ページ）は許可：SNSのカード生成クローラが取得できるようにする。
    // ページ側は noindex なので検索結果には出ない。ほかは従来どおり不可。
    rules: [{ userAgent: "*", allow: ["/legal/", "/v/"], disallow: ["/"] }],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
