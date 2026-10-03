import Link from "next/link";
import { popularTags, rookies, weeklyRanking } from "@/lib/content";
import { viewerContext } from "@/lib/viewer";
import { Icon } from "@/components/Icon";
import { Avatar, VideoBackdrop } from "@/components/VideoBackdrop";
import { TabBar } from "@/components/TabBar";
import { fmt } from "@/components/format";
import { audienceLabel } from "@/lib/audience";

export const metadata = { title: "探す" };

export default async function Explore() {
  const ctx = await viewerContext();
  const [tags, rank, rookieList] = await Promise.all([popularTags(), weeklyRanking(ctx, 10), rookies()]);
  const featured = rank[0];
  return (
    <div className="screen with-nav">
      <form action="/search" style={{ padding: "12px 16px", position: "sticky", top: 0, zIndex: 10, background: "var(--bg)" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: 12, color: "var(--muted)" }}><Icon name="search" size={22} /></span>
          <input className="input pill" style={{ paddingLeft: 44 }} name="q" placeholder="タグ・投稿者・タイトルで検索" aria-label="検索" />
        </div>
      </form>
      <div className="sec" style={{ gap: 24, paddingBottom: 12 }}>
        <Link href="/welcome/tags" className="card" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="cap">見ているジャンル</span><b style={{ flex: 1 }}>{audienceLabel(ctx.audience)}</b><span className="cap" style={{ color: "var(--accent)" }}>変更</span><Icon name="chev" size={18} />
        </Link>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="label">人気のタグ</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{tags.map((t) => <Link key={t.name} className="chip" href={`/tags/${encodeURIComponent(t.name)}`}>#{t.name}</Link>)}</div>
        </section>
        {featured && (
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h2 className="label">特集</h2><span className="cap">運営ピックアップ</span></div>
            <Link href={`/?v=${featured.id}`} className="card" style={{ position: "relative", height: 150, overflow: "hidden", display: "block" }}>
              <VideoBackdrop hue={featured.hue} /><div className="scrim" />
              <div style={{ position: "absolute", left: 16, bottom: 14, color: "#fff" }}><div className="cap" style={{ color: "rgba(255,255,255,.75)" }}>今週の特集</div><div style={{ fontWeight: 700, fontSize: 18 }}>{featured.title}</div></div>
            </Link>
          </section>
        )}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h2 className="label">週間ランキング</h2><span className="cap">再生数・クリック数</span></div>
          <div className="list">
            {rank.map((v, i) => (
              <Link key={v.id} className="row" style={{ minHeight: 84 }} href={`/?v=${v.id}`}>
                <span className="num" style={{ width: 20, fontWeight: 700, fontSize: 18, color: i < 3 ? "var(--accent)" : "var(--muted)" }}>{i + 1}</span>
                <span className="sth"><VideoBackdrop hue={v.hue} still soft /></span>
                <span className="grow"><b style={{ display: "block", fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.title}</b><span className="cap">@{v.creator.handle}・<span className="num">{fmt(v.likes)}</span> いいね</span></span>
              </Link>
            ))}
          </div>
        </section>
        {rookieList.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h2 className="label">新人クリエイター</h2><span className="cap">登録30日以内</span></div>
            <div style={{ display: "flex", gap: 14, overflowX: "auto", scrollbarWidth: "none" }}>
              {rookieList.map((r) => (
                <Link key={r.id} href={`/u/${encodeURIComponent(r.handle)}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, width: 68 }}>
                  <Avatar hue={r.avatarHue} size={60} /><span className="cap" style={{ maxWidth: 68, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.handle}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
      <TabBar />
    </div>
  );
}
