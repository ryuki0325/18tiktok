import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { RegisterSW } from "@/components/RegisterSW";
import { getThemePref, themeCss } from "@/lib/theme-server";

export const metadata: Metadata = {
  title: { default: "Glow", template: "%s | Glow" },
  description: "大人のための、特別なショート動画プラットフォーム（18歳以上限定）",
  robots: { index: false, follow: false },
  applicationName: "Glow",
  appleWebApp: { capable: true, title: "Glow", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
};

// スマホ専用：ピンチで拡大はできるようにしつつ（アクセシビリティ）、入力欄のフォーカスで勝手に拡大しないよう文字は16px以上にしている
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#090A0F", colorScheme: "dark light", interactiveWidget: "resizes-content" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pref = await getThemePref();
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Dancing+Script:wght@700&display=swap" />
        <style id="theme-vars" dangerouslySetInnerHTML={{ __html: themeCss(pref) }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
