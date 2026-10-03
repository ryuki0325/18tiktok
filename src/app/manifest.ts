import type { MetadataRoute } from "next";

/** ホーム画面に追加したとき、アプリのように全画面で開く（PWA） */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VYBE",
    short_name: "VYBE",
    description: "大人のための、特別なショート動画（18歳以上限定）",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#090A0F",
    theme_color: "#090A0F",
    lang: "ja",
    categories: ["entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
