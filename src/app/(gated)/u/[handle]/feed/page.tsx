import { notFound, redirect } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { profileOf, profileVideos } from "@/lib/profile";
import { FeedClient } from "@/components/feed/FeedClient";
import { NavTabs } from "@/components/NavTabs";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  return { title: `@${decodeURIComponent((await params).handle)}` };
}

/** 他の人のプロフィールのサムネイルから開く、その人の投稿だけを縦スクロールする画面 */
export default async function CreatorFeed({ params, searchParams }: {
  params: Promise<{ handle: string }>; searchParams: Promise<{ v?: string }>;
}) {
  const ctx = await viewerContext();
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  const { v } = await searchParams;
  const p = await profileOf({ handle }, ctx.userId);
  if (!p || !p.isCreator) notFound();
  const back = `/u/${encodeURIComponent(p.handle)}`;
  const cards = await profileVideos("posts", p, ctx);
  if (!cards.length) redirect(back);
  const i = Math.max(0, cards.findIndex((c) => c.id === v));
  return (
    <>
      <FeedClient cards={cards} tab="recommended" hasMore={false} loggedIn={!!ctx.user} myId={ctx.user?.id ?? null}
        scoped initialIndex={i} scopedTitle={`@${p.handle} の投稿`} backHref={back} />
      <NavTabs onVideo />
    </>
  );
}
