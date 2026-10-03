import Link from "next/link";
import { search } from "@/lib/content";
import { viewerContext } from "@/lib/viewer";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/VideoBackdrop";
import { VideoGrid } from "@/components/VideoGrid";
import { TabBar } from "@/components/TabBar";

export const metadata = { title: "検索" };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await viewerContext();
  const q = ((await searchParams).q ?? "").trim().slice(0, 50);
  const r = q.length >= 1 ? await search(q, ctx) : null;
  return (
    <div className="screen with-nav">
      <form action="/search" style={{ padding: "12px 16px", display: "flex", gap: 8, alignItems: "center" }}>
        <Link className="iconbtn" href="/explore" aria-label="戻る"><Icon name="back" /></Link>
        <input className="input pill" name="q" defaultValue={q} placeholder="タグ・投稿者・タイトルで検索" aria-label="検索" autoFocus />
      </form>
      <div className="sec" style={{ gap: 20 }}>
        {!r ? <p className="cap" style={{ textAlign: "center", padding: 40 }}>キーワードを入力してください。</p> : (
          <>
            {r.tags.length > 0 && <section style={{ display: "flex", flexDirection: "column", gap: 8 }}><h2 className="label">タグ</h2><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{r.tags.map((t) => <Link key={t.id} className="chip" href={`/tags/${encodeURIComponent(t.name)}`}>#{t.name}</Link>)}</div></section>}
            {r.creators.length > 0 && <section style={{ display: "flex", flexDirection: "column", gap: 8 }}><h2 className="label">投稿者</h2><div className="list">{r.creators.map((c) => <Link key={c.id} className="row" href={`/u/${encodeURIComponent(c.handle)}`}><Avatar hue={c.avatarHue} size={36} /><span className="grow">@{c.handle}</span><Icon name="chev" size={20} /></Link>)}</div></section>}
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}><h2 className="label">動画</h2><VideoGrid cards={r.videos} empty={<p className="cap">「{q}」に一致する動画はありません。</p>} /></section>
          </>
        )}
      </div>
      <TabBar />
    </div>
  );
}
