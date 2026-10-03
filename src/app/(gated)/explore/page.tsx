import Link from "next/link";
import { and, asc, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { featuredSlots } from "@/db/schema";
import { hydrate, popularTags, rookies, trending, weeklyRanking } from "@/lib/content";
import { requestTime } from "@/lib/settings";
import { viewerContext } from "@/lib/viewer";
import { Icon } from "@/components/Icon";
import { Avatar, Thumb } from "@/components/VideoBackdrop";
import { NavTabs } from "@/components/NavTabs";
import { fmt } from "@/components/format";
import { ProfileGrid } from "@/components/profile/ProfileGrid";
import { ExploreSearch } from "./ExploreSearch";

export const metadata = { title: "探す" };

export default async function Explore({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams;
  const ctx = await viewerContext();
  const [tags, rank, rookieList, hot] = await Promise.all([popularTags(), weeklyRanking(ctx, 10), rookies(), trending(ctx, 24)]);
  const now = requestTime();
  const slots = await (await db()).select().from(featuredSlots).where(and(lte(featuredSlots.startsAt, new Date(now)), or(isNull(featuredSlots.endsAt), gt(featuredSlots.endsAt, new Date(now))))).orderBy(asc(featuredSlots.position)).limit(10);
  const featuredCards = slots.length ? await hydrate(slots.map((x) => x.videoId), ctx) : rank.slice(0, 1);
  const featuredTitle = new Map(slots.map((x) => [x.videoId, x.title]));
  return (
    <div className="screen with-nav">
      <ExploreSearch focus={focus === "1"} />
      <div className="sec" style={{ gap: 24, paddingBottom: 12 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="label">人気のタグ</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{tags.map((t) => <Link key={t.name} className="chip" href={`/tags/${encodeURIComponent(t.name)}`}>#{t.name}</Link>)}</div>
        </section>
        {featuredCards.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h2 className="label">特集</h2><span className="cap">運営ピックアップ</span></div>
            <div className="hscroll">
              {featuredCards.map((f) => (
                <Link key={f.id} href={`/?v=${f.id}`} className="card feat" style={{ position: "relative", overflow: "hidden", display: "block" }}>
                  <Thumb card={f} /><div className="scrim" />
                  <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, color: "#fff" }}><div className="cap" style={{ color: "rgba(255,255,255,.75)" }}>{featuredTitle.get(f.id) || "今週の特集"}</div><div style={{ fontWeight: 700, fontSize: 18 }}>{f.title}</div></div>
                </Link>
              ))}
            </div>
          </section>
        )}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><h2 className="label">週間ランキング</h2><span className="cap">再生数・クリック数</span></div>
          <div className="list">
            {rank.map((v, i) => (
              <Link key={v.id} className="row" style={{ minHeight: 84 }} href={`/?v=${v.id}`}>
                <span className="num" style={{ width: 20, fontWeight: 700, fontSize: 18, color: i < 3 ? "var(--accent)" : "var(--muted)" }}>{i + 1}</span>
                <span className="sth"><Thumb card={v} /></span>
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
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="label">いま見られている動画</h2>
          <div style={{ margin: "0 -13px" }}><ProfileGrid cards={hot} empty={<p className="cap">まだ動画がありません。</p>} /></div>
        </section>
      </div>
      <NavTabs />
    </div>
  );
}
