import { requestTime } from "@/lib/settings";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { follows, linkClicks, likes, favorites, videos, views } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Avatar, VideoBackdrop } from "@/components/VideoBackdrop";
import { Icon } from "@/components/Icon";
import { ago, fmt } from "@/components/format";
import { VIDEO_STATUS_LABEL as STATUS } from "@/components/status";

export const metadata = { title: "ダッシュボード" };

/** 投稿者本人の動画の数値だけを表示（IPや閲覧者の情報は出さない） */
export default async function Dashboard() {
  const now = requestTime();
  const u = await requireUser("/creator/dashboard");
  if (u.creatorStatus !== "approved") redirect("/creator/apply");
  const conn = await db();
  const mine = await conn.select().from(videos).where(eq(videos.creatorId, u.id)).orderBy(desc(videos.createdAt));
  const ids = mine.map((v) => v.id);
  const since14 = new Date(now - 14 * 86400_000);
  const since7 = new Date(now - 7 * 86400_000), prev7 = new Date(now - 14 * 86400_000);
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const vIn = ids.length ? inArray(views.videoId, ids) : sql`false`;
  const cIn = ids.length ? inArray(linkClicks.videoId, ids) : sql`false`;
  const [totViews, totClicks, totFavs, totLikes, followers, v7, vPrev, c7, cPrev, daily] = await Promise.all([
    count(conn.select({ n: sql<number>`count(*)::int` }).from(views).where(and(vIn, eq(views.isValid, true)))),
    count(conn.select({ n: sql<number>`count(*)::int` }).from(linkClicks).where(and(cIn, eq(linkClicks.isValid, true)))),
    ids.length ? count(conn.select({ n: sql<number>`count(*)::int` }).from(favorites).where(inArray(favorites.videoId, ids))) : 0,
    ids.length ? count(conn.select({ n: sql<number>`count(*)::int` }).from(likes).where(inArray(likes.videoId, ids))) : 0,
    count(conn.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.creatorId, u.id))),
    count(conn.select({ n: sql<number>`count(*)::int` }).from(views).where(and(vIn, eq(views.isValid, true), gte(views.createdAt, since7)))),
    count(conn.select({ n: sql<number>`count(*)::int` }).from(views).where(and(vIn, eq(views.isValid, true), gte(views.createdAt, prev7), lt(views.createdAt, since7)))),
    count(conn.select({ n: sql<number>`count(*)::int` }).from(linkClicks).where(and(cIn, eq(linkClicks.isValid, true), gte(linkClicks.createdAt, since7)))),
    count(conn.select({ n: sql<number>`count(*)::int` }).from(linkClicks).where(and(cIn, eq(linkClicks.isValid, true), gte(linkClicks.createdAt, prev7), lt(linkClicks.createdAt, since7)))),
    conn.select({ d: sql<string>`to_char(${views.createdAt} at time zone 'Asia/Tokyo', 'MM/DD')`, n: sql<number>`count(*)::int` }).from(views)
      .where(and(vIn, eq(views.isValid, true), gte(views.createdAt, since14))).groupBy(sql`1`).orderBy(sql`1`),
  ]);
  const days: { d: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(now - i * 86400_000);
    const key = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit" }).format(dt);
    days.push({ d: key, n: daily.find((x) => x.d === key)?.n ?? 0 });
  }
  const max = Math.max(1, ...days.map((x) => x.n));
  // 投稿ごとの内訳（公開中のものを再生数の多い順に）。CTR＝リンククリック÷再生数
  const pub = mine.filter((v) => v.status === "published");
  const pubIds = pub.map((v) => v.id);
  const perView = pubIds.length ? await conn.select({ id: views.videoId, n: sql<number>`count(*) filter (where ${views.isValid})::int` }).from(views).where(inArray(views.videoId, pubIds)).groupBy(views.videoId) : [];
  const perClick = pubIds.length ? await conn.select({ id: linkClicks.videoId, n: sql<number>`count(*) filter (where ${linkClicks.isValid})::int` }).from(linkClicks).where(inArray(linkClicks.videoId, pubIds)).groupBy(linkClicks.videoId) : [];
  const vMap = new Map(perView.map((r) => [r.id, r.n]));
  const kMap = new Map(perClick.map((r) => [r.id, r.n]));
  const perVideo = pub.map((v) => ({
    v, views: vMap.get(v.id) ?? 0, clicks: kMap.get(v.id) ?? 0,
    likes: v.likeCount + v.baseLikes,
  })).sort((a, b) => b.views - a.views).slice(0, 20);
  const delta = (a: number, b: number) => (b === 0 ? (a > 0 ? "新規" : "—") : `${a >= b ? "▲" : "▼"} ${Math.abs(Math.round(((a - b) / b) * 100))}%`);
  const stats: [string, number, string][] = [["再生数", totViews, delta(v7, vPrev)], ["リンククリック", totClicks, delta(c7, cPrev)], ["お気に入り", totFavs + totLikes, ""], ["フォロワー", followers, ""]];
  return (
    <div className="screen">
      <NavBar title="ダッシュボード" back="/me" />
      <div className="sec" style={{ gap: 18, paddingBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar hue={u.avatarHue} size={56} />
          <div><div style={{ fontWeight: 700, fontSize: 18 }}>@{u.handle}</div><span className="cap">自分の動画の数値だけが表示されます</span></div>
        </div>
        <div className="stats">
          {stats.map(([k, v, d]) => <div key={k} className="stat"><div className="k">{k}</div><div className="v">{fmt(v)}</div>{d && <div className="num" style={{ fontSize: 11.5, fontWeight: 600, color: d.startsWith("▼") ? "var(--bad)" : "var(--ok)", marginTop: 2 }}>{d} <span className="muted" style={{ fontWeight: 500 }}>前週比</span></div>}</div>)}
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}><b style={{ fontSize: 15 }}>日別の再生数</b><span className="cap">直近14日</span></div>
          <svg viewBox="0 0 330 124" width="100%" height="124" role="img" aria-label="直近14日の再生数">
            {[0, 1, 2].map((i) => <line key={i} x1="0" x2="330" y1={14 + i * 43} y2={14 + i * 43} stroke="var(--text)" strokeOpacity=".08" />)}
            {days.map((x, i) => { const h = (x.n / max) * 86; return <rect key={x.d} x={i * 23.6 + 3} y={100 - h} width="15" height={h} rx="4" fill="var(--accent)" fillOpacity={i === days.length - 1 ? 1 : 0.45}><title>{`${x.d}：${x.n}回`}</title></rect>; })}
            <text x="0" y="120" fontSize="10" fill="var(--muted)">{days[0].d}</text>
            <text x="330" y="120" fontSize="10" fill="var(--muted)" textAnchor="end">{days[13].d}</text>
            <text x={13 * 23.6 + 10} y={100 - (days[13].n / max) * 86 - 4} fontSize="10.5" fontWeight="700" fill="var(--text)" textAnchor="middle">{fmt(days[13].n)}</text>
          </svg>
        </div>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><h2 className="label" style={{ margin: 0 }}>直近の投稿</h2><Link className="cap" href="/creator/videos">すべて見る</Link></div>
          <div className="list">
            {mine.filter((v) => v.status !== "deleted").slice(0, 6).map((v) => { const [l, c] = STATUS[v.status]; return (
              <div key={v.id} className="row" style={{ minHeight: 88 }}>
                <span className="sth"><VideoBackdrop hue={v.hue} /></span>
                <span className="grow"><b style={{ display: "block", fontSize: 14, marginBottom: 4 }}>{v.title}</b>{v.status === "rejected" && <span className="cap" style={{ color: "var(--bad)" }}>理由：{v.statusReason}</span>}</span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}><span className={`badge ${c}`}>{l}</span><span className="cap">{ago(v.createdAt)}</span></span>
              </div>); })}
            {mine.length === 0 && <div className="row"><span className="cap">まだ投稿はありません。</span><Link className="chip" href="/creator/new"><Icon name="plus" size={14} />投稿する</Link></div>}
          </div>
        </section>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="label" style={{ margin: 0 }}>投稿ごとの数字<small>公開中・再生の多い順</small></h2>
          {perVideo.length === 0 ? <p className="cap">公開中の投稿がありません。</p> : (
            <div className="tbl-wrap">
              <table className="tbl an-tbl">
                <thead><tr><th>投稿</th><th className="num">再生</th><th className="num">いいね</th><th className="num">クリック</th><th className="num">CTR</th></tr></thead>
                <tbody>
                  {perVideo.map(({ v, views: vw, clicks, likes: lk }) => (
                    <tr key={v.id}>
                      <td style={{ maxWidth: 160 }}><Link href={`/?v=${v.id}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{v.title}</Link></td>
                      <td className="num">{fmt(vw)}</td>
                      <td className="num">{fmt(lk)}</td>
                      <td className="num">{fmt(clicks)}</td>
                      <td className="num">{vw > 0 ? `${Math.round((clicks / vw) * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <span className="cap">CTR＝「完全版を見る」のクリック数 ÷ 再生数。数字は本人の投稿のぶんだけです。</span>
        </section>
      </div>
    </div>
  );
}
