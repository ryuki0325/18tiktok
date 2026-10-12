import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: ["/legal/"], disallow: ["/"] }],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
