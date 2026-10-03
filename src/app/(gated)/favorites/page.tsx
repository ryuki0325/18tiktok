import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { favorites } from "@/db/schema";
import { hydrate } from "@/lib/content";
import { viewerContext } from "@/lib/viewer";
import { Icon } from "@/components/Icon";
import { NavBar } from "@/components/NavBar";
import { VideoGrid } from "@/components/VideoGrid";
import { TabBar } from "@/components/TabBar";

export const metadata = { title: "お気に入り" };

export default async function Favorites() {
  const ctx = await viewerContext();
  const rows = await (await db()).select({ id: favorites.videoId }).from(favorites).where(eq(favorites.viewerKey, ctx.viewerKey)).orderBy(desc(favorites.createdAt)).limit(120);
  const cards = await hydrate(rows.map((r) => r.id), ctx);
  return (
    <div className="screen with-nav">
      <NavBar title="お気に入り" />
      <div className="sec" style={{ gap: 14 }}>
        {!ctx.user && (
          <div className="card" style={{ padding: "12px 14px", display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ color: "var(--accent)" }}><Icon name="lock" size={20} /></span>
            <span style={{ fontSize: 13, flex: 1 }}>この端末に保存されています。ログインすると、ほかの端末と同期できます。</span>
            <Link className="chip" style={{ background: "var(--fill)", color: "var(--on)" }} href="/login?next=/favorites">ログイン</Link>
          </div>
        )}
      </div>
      <div style={{ padding: "12px 3px 0" }}>
        <VideoGrid cards={cards} empty={
          <div style={{ textAlign: "center", padding: "60px 20px", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }} className="muted">
            <Icon name="bookmark" size={36} /><b style={{ color: "var(--text)" }}>まだ保存した動画はありません</b><span style={{ fontSize: 13.5 }}>フィードの「保存」をタップすると、ここに並びます。</span>
          </div>} />
      </div>
      <TabBar />
    </div>
  );
}
