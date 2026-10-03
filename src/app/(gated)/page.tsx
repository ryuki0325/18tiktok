import { feed, hydrate, type FeedTab } from "@/lib/content";
import { viewerContext } from "@/lib/viewer";
import { FeedClient } from "@/components/feed/FeedClient";
import { NavTabs } from "@/components/NavTabs";

export const metadata = { title: "ホーム" };

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; v?: string }> }) {
  const { tab: t, v } = await searchParams;
  const tab: FeedTab = t === "popular" || t === "following" ? t : "recommended";
  const ctx = await viewerContext();
  let cards = await feed(tab, ctx, 6);
  if (v) {
    const i = cards.findIndex((c) => c.id === v);
    if (i > 0) cards = [cards[i], ...cards.slice(0, i), ...cards.slice(i + 1)];
    if (i < 0) cards = [...(await hydrate([v], ctx)), ...cards];
  }
  return (
    <>
      <FeedClient key={`${tab}:${v ?? ""}`} cards={cards} tab={tab} hasMore={cards.length === 6} loggedIn={!!ctx.user} myId={ctx.user?.id ?? null} />
      <NavTabs onVideo />
    </>
  );
}
