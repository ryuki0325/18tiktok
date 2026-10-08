import { notFound, redirect } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { profileOf, profileVideos, type ProfileTab } from "@/lib/profile";
import { FeedClient } from "@/components/feed/FeedClient";
import { NavTabs } from "@/components/NavTabs";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  return { title: `@${decodeURIComponent((await params).handle)}` };
}

/** 他の人のプロフィールのサムネイルから開く、その人の投稿だけを縦スクロールする画面 */
export default async function CreatorFeed({ params, searchParams }: {
  params: Promise<{ handle: string }>; searchParams: Promise<{ v?: string; tab?: string }>;
}) {
  const ctx = await viewerContext();
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  const { v, tab: t } = await searchParams;
  const p = await profileOf({ handle }, ctx.userId);
  if (!p || !p.isCreator) notFound();
  // 他の人のページで見られるのは「投稿」と、本人が公開している「いいね」だけ
  const tab: ProfileTab = t === "liked" && p.publicLikes ? "liked" : "posts";
  const back = tab === "liked" ? `/u/${encodeURIComponent(p.handle)}?tab=liked` : `/u/${encodeURIComponent(p.handle)}`;
  const cards = await profileVideos(tab, p, ctx);
  if (!cards.length) redirect(back);
  const i = Math.max(0, cards.findIndex((c) => c.id === v));
  return (
    <>
      <FeedClient cards={cards} tab="recommended" hasMore={false} loggedIn={!!ctx.user} myId={ctx.user?.id ?? null}
        scoped initialIndex={i} scopedTitle={tab === "liked" ? `@${p.handle} のいいね` : `@${p.handle} の投稿`} backHref={back} />
      <NavTabs onVideo />
    </>
  );
}
