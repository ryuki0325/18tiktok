import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems, collections } from "@/db/schema";
import { viewerContext } from "@/lib/viewer";
import { hydrate } from "@/lib/content";
import { FeedClient } from "@/components/feed/FeedClient";
import { NavTabs } from "@/components/NavTabs";

export const metadata = { title: "コレクション" };

/** コレクションのサムネから開く、その中の動画だけを縦スクロールする画面 */
export default async function CollectionFeed({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const ctx = await viewerContext();
  if (!ctx.user) redirect("/login");
  const conn = await db();
  const [col] = await conn.select().from(collections).where(and(eq(collections.id, id), eq(collections.userId, ctx.user.id)));
  if (!col) notFound();
  const back = `/collections/${id}`;
  const items = await conn.select({ videoId: collectionItems.videoId }).from(collectionItems)
    .where(eq(collectionItems.collectionId, id)).orderBy(desc(collectionItems.addedAt)).limit(120);
  const cards = items.length ? await hydrate(items.map((x) => x.videoId), ctx, conn) : [];
  if (!cards.length) redirect(back);
  const i = Math.max(0, cards.findIndex((c) => c.id === v));
  return (
    <>
      <FeedClient cards={cards} tab="recommended" hasMore={false} loggedIn myId={ctx.user.id}
        scoped initialIndex={i} scopedTitle={col.name} backHref={back} />
      <NavTabs onVideo />
    </>
  );
}
