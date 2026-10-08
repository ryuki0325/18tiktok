import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { destinations, linkClicks, outboundLinks, users, videos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { destinationAction } from "@/lib/admin-actions";
import { requestTime } from "@/lib/settings";
import { ago, fmt } from "@/components/format";
import { EmergencyButtons } from "../EmergencyButtons";
import { ConfirmButton } from "../ConfirmButton";

export const metadata = { title: "送客先" };

const ST: Record<string, [string, string]> = {
  pending: ["承認待ち", "b-warn"], approved: ["稼働中", "b-ok"], paused: ["停止中", "b-bad"], rejected: ["不可", "b-bad"],
};

/**
 * 「完全版を見る」の送客先。
 * 停止にすると、そのサービス宛てのリンクが一括で止まる（移動の直前に確認している）。
 */
export default async function Links() {
  await requireAdmin(["super_admin"]);
  const now = requestTime();
  const conn = await db();
  const month = new Date(now - 30 * 86400_000);

  // 送客先ごとの「稼働リンク数」「30日クリック数」は、相関サブクエリ（スキーマ修飾で不具合）を避けて
  // それぞれ集計してからメモリ上で突き合わせる。
  const [destRows, linkCountRows, destClickRows] = await Promise.all([
    conn.select().from(destinations).orderBy(desc(destinations.createdAt)),
    conn.select({ destinationId: outboundLinks.destinationId, n: sql<number>`count(*)::int` })
      .from(outboundLinks).where(eq(outboundLinks.status, "active")).groupBy(outboundLinks.destinationId),
    conn.select({ destinationId: linkClicks.destinationId, n: sql<number>`count(*)::int` })
      .from(linkClicks).where(and(eq(linkClicks.isValid, true), gte(linkClicks.createdAt, month))).groupBy(linkClicks.destinationId),
  ]);
  const linkMap = new Map(linkCountRows.map((r) => [r.destinationId, r.n]));
  const destClickMap = new Map(destClickRows.map((r) => [r.destinationId, r.n]));
  const dests = destRows.map((d) => ({ d, links: linkMap.get(d.id) ?? 0, clicks: destClickMap.get(d.id) ?? 0 }));

  const recentRows = await conn.select({
    id: outboundLinks.id, url: outboundLinks.url, status: outboundLinks.status, title: videos.title, handle: users.handle,
  }).from(outboundLinks).innerJoin(videos, eq(videos.id, outboundLinks.videoId)).innerJoin(users, eq(users.id, videos.creatorId))
    .orderBy(desc(outboundLinks.createdAt)).limit(40);
  const linkClickRows = await conn.select({ linkId: linkClicks.linkId, n: sql<number>`count(*)::int` })
    .from(linkClicks).where(eq(linkClicks.isValid, true)).groupBy(linkClicks.linkId);
  const linkClickMap = new Map(linkClickRows.map((r) => [r.linkId, r.n]));
  const recent = recentRows.map((l) => ({ ...l, clicks: linkClickMap.get(l.id) ?? 0 }));

  const [{ n: clicks30 }] = await conn.select({ n: sql<number>`count(*)::int` }).from(linkClicks)
    .where(and(gte(linkClicks.createdAt, month), eq(linkClicks.isValid, true)));

  return (
    <>
      <h1>送客先（完全版を見る）</h1>
      <p className="cap" style={{ marginTop: -6 }}>
        投稿者は、ここで<b>承認したサービス</b>のURLしか登録できません。「停止」を押すと、そのサービス宛てのリンクがすべて止まります。
        30日間の有効クリック：<span className="num">{fmt(clicks30)}</span>
      </p>

      <h2 style={{ fontSize: 16 }}>サービス一覧</h2>
      <div className="tbl-wrap" style={{ marginBottom: 20 }}><table className="tbl">
        <thead><tr><th>サービス</th><th>ドメイン</th><th>状態</th><th>稼働リンク</th><th>30日クリック</th><th>操作</th></tr></thead>
        <tbody>
          {dests.length === 0 ? <tr><td colSpan={6} className="muted">まだ登録されていません。下のフォームから追加してください。</td></tr>
            : dests.map(({ d, links, clicks }) => (
              <tr key={d.id}>
                <td><b>{d.serviceName}</b>{d.urlPattern && <div className="cap">形：{d.urlPattern}</div>}</td>
                <td className="num">{d.domain}</td>
                <td><span className={`badge ${ST[d.status][1]}`}>{ST[d.status][0]}</span>{d.approvedAt && <div className="cap">{ago(d.approvedAt)}承認</div>}</td>
                <td className="num">{fmt(links)}</td>
                <td className="num">{fmt(clicks)}</td>
                <td>
                  <form action={destinationAction} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input type="hidden" name="id" value={d.id} />
                    <input className="input" name="reason" placeholder="理由" style={{ height: 32, width: 110, fontSize: 12 }} aria-label="理由" />
                    {d.status !== "approved" && <button className="btn btn-sm btn-primary" name="op" value="approve">承認</button>}
                    {d.status === "approved" && <button className="btn btn-sm btn-danger" name="op" value="pause">停止</button>}
                    <ConfirmButton className="btn btn-sm btn-secondary" name="op" value="delete"
                      message={`「${d.serviceName}」を削除します。よろしいですか？\nこのサービス宛てのリンクはすべて止まり、ひもづく投稿者の登録も外れます。`}>削除</ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
        </tbody>
      </table></div>

      <h2 style={{ fontSize: 16 }}>サービスを追加</h2>
      <form action={destinationAction} className="card" style={{ padding: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 24 }}>
        <input type="hidden" name="op" value="add" />
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="label">サービス名</span>
          <input className="input" name="serviceName" placeholder="FANZA" style={{ height: 38, width: 160 }} required aria-label="サービス名" /></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="label">ドメイン</span>
          <input className="input num" name="domain" placeholder="al.dmm.co.jp" style={{ height: 38, width: 200 }} required aria-label="ドメイン" /></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="label">代表URL<small>任意</small></span>
          <input className="input" name="affiliateUrl" placeholder="https://..." style={{ height: 38, width: 220 }} aria-label="代表URL" /></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="label">URLの形<small>任意・正規表現</small></span>
          <input className="input num" name="urlPattern" placeholder="^https://al\.dmm\.co\.jp/" style={{ height: 38, width: 240 }} aria-label="URLの形" /></label>
        <button className="btn btn-sm btn-primary">追加（承認待ちで登録）</button>
      </form>

      <h2 style={{ fontSize: 16 }}>最近登録されたリンク</h2>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>動画</th><th>投稿者</th><th>URL</th><th>状態</th><th>クリック</th><th>操作</th></tr></thead>
        <tbody>
          {recent.length === 0 ? <tr><td colSpan={6} className="muted">まだリンクはありません。</td></tr>
            : recent.map((l) => (
              <tr key={l.id}>
                <td>{l.title}</td><td>@{l.handle}</td>
                <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}><span className="num cap">{l.url}</span></td>
                <td><span className={`badge ${l.status === "active" ? "b-ok" : l.status === "pending_domain_review" ? "b-warn" : "b-bad"}`}>
                  {l.status === "active" ? "有効" : l.status === "pending_domain_review" ? "承認待ち" : "停止"}</span></td>
                <td className="num">{fmt(l.clicks)}</td>
                <td>{l.status === "active" && <EmergencyButtons targetId={l.id} actions={["disable_link"]} compact />}</td>
              </tr>
            ))}
        </tbody>
      </table></div>
    </>
  );
}
