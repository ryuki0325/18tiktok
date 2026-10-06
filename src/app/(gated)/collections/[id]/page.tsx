import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { collectionItems, collections } from "@/db/schema";
import { viewerContext } from "@/lib/viewer";
import { hydrate } from "@/lib/content";
import { deleteCollectionAction, renameCollectionAction } from "@/lib/social-actions";
import { NavBar } from "@/components/NavBar";
import { ProfileGrid } from "@/components/profile/ProfileGrid";
import { Icon } from "@/components/Icon";

export const metadata = { title: "コレクション" };

export default async function Collection({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await viewerContext();
  if (!ctx.user) redirect("/login");
  const conn = await db();
  const [col] = await conn.select().from(collections).where(and(eq(collections.id, id), eq(collections.userId, ctx.user.id)));
  if (!col) notFound();
  const items = await conn.select({ videoId: collectionItems.videoId }).from(collectionItems)
    .where(eq(collectionItems.collectionId, id)).orderBy(desc(collectionItems.addedAt)).limit(120);
  const cards = items.length ? await hydrate(items.map((x) => x.videoId), ctx, conn) : [];
  return (
    <div className="screen">
      <NavBar title={col.name} back="/collections" />
      <div className="sec" style={{ gap: 14, paddingBottom: 24 }}>
        <details>
          <summary className="cap" style={{ cursor: "pointer" }}>名前を変える・削除する</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            <form action={renameCollectionAction} style={{ display: "flex", gap: 8 }}>
              <input type="hidden" name="id" value={col.id} />
              <input className="input" name="name" defaultValue={col.name} maxLength={40} required aria-label="コレクション名" style={{ height: 42 }} />
              <button className="btn btn-secondary" style={{ width: "auto", padding: "0 16px" }}>変更</button>
            </form>
            <form action={deleteCollectionAction}>
              <input type="hidden" name="id" value={col.id} />
              <button className="btn btn-danger btn-sm">このコレクションを削除</button>
            </form>
          </div>
        </details>
        {cards.length === 0
          ? <div className="prof-empty"><Icon name="bookmark" size={38} /><b>まだ空です</b><span className="cap">動画の「保存」を長押し、またはコレクションに追加から入れられます。</span></div>
          : <ProfileGrid cards={cards} empty={null} />}
      </div>
    </div>
  );
}
