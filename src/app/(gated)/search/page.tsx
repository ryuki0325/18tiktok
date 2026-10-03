import Link from "next/link";
import { search } from "@/lib/content";
import { viewerContext } from "@/lib/viewer";
import { Icon } from "@/components/Icon";
import { NavTabs } from "@/components/NavTabs";
import { ProfileGrid } from "@/components/profile/ProfileGrid";
import { PeopleList } from "@/components/profile/PeopleList";

export const metadata = { title: "検索" };

const TABS = [["all", "すべて"], ["videos", "動画"], ["users", "ユーザー"], ["tags", "タグ"]] as const;
type Tab = (typeof TABS)[number][0];

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const ctx = await viewerContext();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 50);
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "all") as Tab;
  const r = q.length >= 1 ? await search(q, ctx) : null;
  const link = (t: Tab) => `/search?q=${encodeURIComponent(q)}${t === "all" ? "" : `&tab=${t}`}`;
  const none = <p className="cap" style={{ textAlign: "center", padding: "48px 20px" }}>「{q}」に一致するものはありません。</p>;

  return (
    <div className="screen with-nav">
      <form action="/search" role="search" style={{ padding: "12px 16px", display: "flex", gap: 8, alignItems: "center" }}>
        <Link className="iconbtn" href="/explore" aria-label="戻る"><Icon name="back" /></Link>
        <input className="input pill" name="q" type="search" enterKeyHint="search" defaultValue={q} placeholder="タグ・投稿者・タイトルで検索" aria-label="キーワードを入力" autoFocus={!q} />
      </form>
      {r && (
        <nav className="srch-tabs" role="tablist" aria-label="検索結果の種類">
          {TABS.map(([k, l]) => <Link key={k} role="tab" aria-selected={tab === k} href={link(k as Tab)} scroll={false}>{l}</Link>)}
        </nav>
      )}
      {!r ? (
        <p className="cap" style={{ textAlign: "center", padding: 40 }}>キーワードを入力してください。</p>
      ) : (
        <div className="sec" style={{ gap: 20, paddingTop: 14 }}>
          {(tab === "all" || tab === "tags") && r.tags.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tab === "all" && <h2 className="label">タグ</h2>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{r.tags.map((t) => <Link key={t.id} className="chip" href={`/tags/${encodeURIComponent(t.name)}`}>#{t.name}</Link>)}</div>
            </section>
          )}
          {(tab === "all" || tab === "users") && r.creators.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {tab === "all" && <h2 className="label">ユーザー</h2>}
              <div style={{ margin: "0 -16px" }}>
                <PeopleList people={r.creators.map((c) => ({ ...c, followed: false }))} meId={ctx.userId} loggedIn={!!ctx.user} empty={null} />
              </div>
            </section>
          )}
          {(tab === "all" || tab === "videos") && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tab === "all" && <h2 className="label">動画</h2>}
              <div style={{ margin: "0 -13px" }}><ProfileGrid cards={r.videos} empty={tab === "videos" ? none : <p className="cap">動画は見つかりませんでした。</p>} /></div>
            </section>
          )}
          {tab === "tags" && r.tags.length === 0 && none}
          {tab === "users" && r.creators.length === 0 && none}
          {tab === "all" && !r.tags.length && !r.creators.length && !r.videos.length && none}
        </div>
      )}
      <NavTabs />
    </div>
  );
}
