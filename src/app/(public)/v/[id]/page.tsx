import Link from "next/link";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, videos } from "@/db/schema";
import { absoluteUrl } from "@/lib/mail";
import { isUuid } from "@/lib/media";

/**
 * 共有用の動画ページ（年齢確認の外＝公開）。
 * SNS（X・Telegram・LINE 等）に動画リンクを貼ったとき、サムネイル＋タイトルの
 * プレビューカードが出るように Open Graph / Twitter Card を付ける＝集客の入口。
 * 本体の再生はここではせず、「VYBEで見る」からフィード（/?v=）へ送る（＝通常の年齢確認を通る）。
 * 検索エンジンには載せない（noindex）。カードを読むSNSのクローラは noindex でも取得する。
 */

const SITE = "VYBE";

type Pub = { id: string; title: string; description: string; thumb: string | null; handle: string } | null;

/** 公開中・全体公開の動画だけを、共有に出してよい最小情報で返す */
async function getPublicVideo(id: string): Promise<Pub> {
  if (!isUuid(id)) return null;
  const conn = await db();
  const [row] = await conn
    .select({
      id: videos.id, title: videos.title, description: videos.description,
      thumb: videos.thumbnailUrl, status: videos.status, visibility: videos.visibility, handle: users.handle,
    })
    .from(videos).innerJoin(users, eq(users.id, videos.creatorId))
    .where(eq(videos.id, id));
  if (!row || row.status !== "published" || row.visibility !== "public") return null;
  return { id: row.id, title: row.title, description: row.description, thumb: row.thumb, handle: row.handle };
}

/** サムネイルURLを絶対URLに（相対なら自サイトのホストを付ける） */
async function absThumb(thumb: string | null): Promise<string | null> {
  if (!thumb) return null;
  return /^https?:\/\//.test(thumb) ? thumb : absoluteUrl(thumb);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const v = await getPublicVideo(id).catch(() => null);
  const url = await absoluteUrl(`/v/${id}`);
  if (!v) return { title: SITE, robots: { index: false, follow: false } };
  const title = `${v.title}｜${SITE}`;
  const desc = (v.description?.trim() || `@${v.handle} の動画をVYBEで見る`).slice(0, 120);
  const img = await absThumb(v.thumb);
  return {
    title, description: desc,
    robots: { index: false, follow: false },
    alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: SITE, type: "video.other", images: img ? [{ url: img }] : undefined },
    twitter: { card: img ? "summary_large_image" : "summary", title, description: desc, images: img ? [img] : undefined },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getPublicVideo(id).catch(() => null);
  const enter = `/?v=${encodeURIComponent(id)}`;
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg, #0a0a0a)", color: "var(--on, #fff)" }}>
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
        <span style={{ fontWeight: 900, letterSpacing: 1, fontSize: 20, background: "linear-gradient(90deg,#ff2d78,#ff6a3d)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>VYBE</span>
        {/* 年齢確認の外（公開）なので、本編のサムネイルはここでは出さない。
            SNSのプレビューカード（og:image）には出るが、ページ上では 18歳以上の確認後（フィード側）に表示する。 */}
        {v ? (
          <>
            <h1 style={{ fontSize: 18, margin: 0, lineHeight: 1.4 }}>{v.title}</h1>
            <p style={{ margin: 0, opacity: 0.7, fontSize: 14 }}>@{v.handle}</p>
          </>
        ) : (
          <h1 style={{ fontSize: 18, margin: 0 }}>この動画は見つかりませんでした</h1>
        )}
        <Link href={enter} className="btn btn-primary" style={{ width: "100%", maxWidth: 300, marginTop: 4 }}>VYBEで見る（18歳以上）</Link>
        <p style={{ margin: 0, opacity: 0.6, fontSize: 12 }}>18歳未満の方は閲覧できません。</p>
      </div>
    </main>
  );
}
