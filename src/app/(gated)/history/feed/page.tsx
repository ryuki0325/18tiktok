import { redirect } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { watchHistory } from "@/lib/history";
import { FeedClient } from "@/components/feed/FeedClient";
import { NavTabs } from "@/components/NavTabs";

export const metadata = { title: "視聴履歴" };

/** 視聴履歴のサムネイルから開く、見た動画だけを縦スクロールする画面 */
export default async function HistoryFeed({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const ctx = await viewerContext();
  if (!ctx.user) redirect(`/login?next=${encodeURIComponent("/history")}`);
  const { v } = await searchParams;
  const cards = await watchHistory(ctx.user.id, ctx);
  if (!cards.length) redirect("/history");
  const i = Math.max(0, cards.findIndex((c) => c.id === v));
  return (
    <>
      <FeedClient cards={cards} tab="recommended" hasMore={false} loggedIn myId={ctx.user.id}
        scoped initialIndex={i} scopedTitle="視聴履歴" backHref="/history" />
      <NavTabs onVideo />
    </>
  );
}
