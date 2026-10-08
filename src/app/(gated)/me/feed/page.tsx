import { redirect } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { profileOf, profileVideos, type ProfileTab } from "@/lib/profile";
import { FeedClient } from "@/components/feed/FeedClient";
import { NavTabs } from "@/components/NavTabs";

export const metadata = { title: "マイページ" };

const TAB_TITLE: Record<ProfileTab, string> = {
  posts: "あなたの投稿", private: "非公開の動画", saved: "保存した動画", liked: "いいねした動画",
};

/** プロフィールのサムネイルから開く、自分の動画だけを縦スクロールする画面（TikTokと同じ） */
export default async function MeFeed({ searchParams }: { searchParams: Promise<{ tab?: string; v?: string }> }) {
  const ctx = await viewerContext();
  const { tab: t, v } = await searchParams;
  if (!ctx.user) redirect(`/login?next=${encodeURIComponent("/me")}`);
  const tab: ProfileTab = (["posts", "private", "saved", "liked"] as const).includes(t as ProfileTab) ? (t as ProfileTab) : "posts";
  const p = (await profileOf({ id: ctx.user.id }, ctx.user.id))!;
  const cards = await profileVideos(tab, p, ctx);
  if (!cards.length) redirect(tab === "posts" ? "/me" : `/me?tab=${tab}`);
  const i = Math.max(0, cards.findIndex((c) => c.id === v));
  return (
    <>
      <FeedClient cards={cards} tab="recommended" hasMore={false} loggedIn myId={ctx.user.id}
        scoped initialIndex={i} scopedTitle={TAB_TITLE[tab]} backHref={tab === "posts" ? "/me" : `/me?tab=${tab}`} />
      <NavTabs onVideo />
    </>
  );
}
