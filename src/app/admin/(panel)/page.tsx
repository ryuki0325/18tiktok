import { requestTime } from "@/lib/settings";
import Link from "next/link";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { linkClicks, reportTickets, users, videos, views } from "@/db/schema";
import { REASON_LABEL } from "@/lib/moderation";
import { fmt } from "@/components/format";

export const metadata = { title: "ダッシュボード" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const now = requestTime();
  const { denied } = await searchParams;
  const conn = await db();
  const day = new Date(now - 86400_000);
  const c = sql<number>`count(*)::int`;
  const [[{ n: v24 }], [{ n: k24 }], [{ n: u24 }], [{ n: pub }], urgent] = await Promise.all([
    conn.select({ n: c }).from(views).where(and(gte(views.createdAt, day), eq(views.isValid, true))),
    conn.select({ n: c }).from(linkClicks).where(and(gte(linkClicks.createdAt, day), eq(linkClicks.isValid, true))),
    conn.select({ n: c }).from(users).where(gte(users.createdAt, day)),
    conn.select({ n: c }).from(videos).where(eq(videos.status, "published")),
    conn.select().from(reportTickets).where(eq(reportTickets.status, "open")).orderBy(asc(reportTickets.slaDueAt)).limit(5),
  ]);
  return (
    <>
      <h1>ダッシュボード</h1>
      {denied && <div className="notice bad" style={{ marginBottom: 16 }}>この操作の権限がありません。</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
        {[["24時間の再生", v24], ["24時間のリンククリック", k24], ["24時間の新規登録", u24], ["公開中の動画", pub]].map(([k, v]) => (
          <div key={k} className="stat"><div className="k">{k}</div><div className="v">{fmt(Number(v))}</div></div>
        ))}
      </div>
      <h2 style={{ fontSize: 16 }}>対応期限が近い通報</h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>優先度</th><th>理由</th><th>期限</th><th>自動非公開</th></tr></thead><tbody>
        {urgent.length === 0 ? <tr><td colSpan={4} className="muted">未対応の通報はありません。</td></tr> : urgent.map((r) => {
          const left = (r.slaDueAt.getTime() - now) / 3600_000;
          return <tr key={r.id}><td><span className={`badge ${r.priority === "P0" ? "b-bad" : r.priority === "P1" ? "b-warn" : "b-info"}`}>{r.priority}</span></td><td>{REASON_LABEL[r.reason]}</td>
            <td className="num" style={{ color: left < 0 ? "var(--bad)" : left < 6 ? "var(--warn)" : undefined }}>{left < 0 ? `${Math.ceil(-left)}時間超過` : `残り${Math.floor(left)}時間`}</td><td>{r.autoHidden ? "済" : "—"}</td></tr>;
        })}
      </tbody></table></div>
      <p style={{ marginTop: 12 }}><Link href="/admin/reports" style={{ color: "var(--accent)" }}>通報キューを開く →</Link></p>
    </>
  );
}
