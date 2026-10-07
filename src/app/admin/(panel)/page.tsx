import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { linkClicks, moderationCases, reports, userSanctions, users, videos, views } from "@/db/schema";
import { PRIORITY_LABEL, TARGET_LABEL } from "@/lib/report-reasons";
import { SANCTION_LABEL } from "@/lib/safety";
import { requestTime } from "@/lib/settings";
import { ago, fmt } from "@/components/format";

export const metadata = { title: "ダッシュボード" };

const CLS: Record<string, string> = { critical: "b-bad", high: "b-warn", medium: "b-info", low: "b-info" };

/**
 * 運営のトップ画面。緊急（critical）の案件を必ず一番上に出す。
 * ここを見れば「いま何をすべきか」が分かる状態を目指している。
 */
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const now = requestTime();
  const { denied } = await searchParams;
  const conn = await db();
  const day = new Date(now - 86400_000);
  const week = new Date(now - 7 * 86400_000);
  const c = sql<number>`count(*)::int`;
  const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

  const [critical, openCases, openReports, overdue, deleted, suspended, v24, k24, pub, incidents] = await Promise.all([
    // 緊急案件は中身まで出す
    conn.select().from(moderationCases)
      .where(and(eq(moderationCases.priority, "critical"), inArray(moderationCases.status, ["open", "in_progress"])))
      .orderBy(asc(moderationCases.dueAt), asc(moderationCases.createdAt)).limit(10),
    one(conn.select({ n: c }).from(moderationCases).where(inArray(moderationCases.status, ["open", "in_progress"]))),
    one(conn.select({ n: c }).from(reports).where(inArray(reports.status, ["open", "in_progress"]))),
    one(conn.select({ n: c }).from(moderationCases).where(and(inArray(moderationCases.status, ["open", "in_progress"]), sql`${moderationCases.dueAt} < now()`))),
    one(conn.select({ n: c }).from(videos).where(eq(videos.status, "deleted"))),
    one(conn.select({ n: c }).from(users).where(sql`${users.status} in ('suspended','banned')`)),
    one(conn.select({ n: c }).from(views).where(and(gte(views.createdAt, day), eq(views.isValid, true)))),
    one(conn.select({ n: c }).from(linkClicks).where(and(gte(linkClicks.createdAt, day), eq(linkClicks.isValid, true)))),
    one(conn.select({ n: c }).from(videos).where(eq(videos.status, "published"))),
    // 直近の重大なできごと
    conn.select({ s: userSanctions, handle: users.handle }).from(userSanctions).innerJoin(users, eq(users.id, userSanctions.userId))
      .where(and(gte(userSanctions.createdAt, week), sql`${userSanctions.kind} in ('suspend','ban')`))
      .orderBy(desc(userSanctions.id)).limit(8),
  ]);

  const queue: [string, number, string, boolean][] = [
    ["未処理の案件", openCases, "/admin/cases", openCases > 0],
    ["未対応の通報", openReports, "/admin/cases", openReports > 0],
    ["期限を過ぎた案件", overdue, "/admin/cases", overdue > 0],
    ["停止中の利用者", suspended, "/admin/users", false],
    ["削除済みの動画", deleted, "/admin/videos", false],
  ];

  return (
    <>
      <h1>ダッシュボード</h1>
      {denied && <div className="notice bad" style={{ marginBottom: 16 }}>この操作の権限がありません。</div>}

      {/* 緊急案件は必ず最上部 */}
      {critical.length > 0 && (
        <section className="card" style={{ padding: 16, marginBottom: 22, boxShadow: "inset 5px 0 0 var(--bad)" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 10px", color: "var(--bad)" }}>緊急の案件 {critical.length}件 ― 最優先で対応してください</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {critical.map((x) => {
              const left = x.dueAt ? (x.dueAt.getTime() - now) / 3600_000 : null;
              return (
                <div key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", background: "var(--surface-2)", borderRadius: 10 }}>
                  <span className="badge b-bad">{PRIORITY_LABEL[x.priority]}</span>
                  <span className="badge b-info">{TARGET_LABEL[x.targetType]}</span>
                  <b style={{ fontSize: 14 }}>{x.summary}</b>
                  {x.reportCount > 1 && <span className="badge b-warn num">通報{x.reportCount}件</span>}
                  {left !== null && <span className="cap num" style={{ color: left < 0 ? "var(--bad)" : "var(--warn)" }}>{left < 0 ? `期限を${Math.ceil(-left)}時間超過` : `残り${Math.floor(left)}時間`}</span>}
                  <Link className="btn btn-sm btn-danger" style={{ marginLeft: "auto" }} href="/admin/cases">対応する</Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <h2 style={{ fontSize: 16, marginTop: 0 }}>対応が必要なもの</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 24 }}>
        {queue.map(([k, v, href, hot]) => (
          <Link key={k} className="stat" href={href} style={{ display: "block", boxShadow: hot ? "inset 3px 0 0 var(--warn)" : undefined }}>
            <div className="k">{k}</div><div className="v">{fmt(v)}</div>
          </Link>
        ))}
      </div>

      <h2 style={{ fontSize: 16 }}>24時間の様子</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
        {([["再生", v24], ["リンククリック", k24], ["公開中の動画", pub]] as const).map(([k, v]) => (
          <div key={k} className="stat"><div className="k">{k}</div><div className="v">{fmt(v)}</div></div>
        ))}
      </div>

      <h2 style={{ fontSize: 16 }}>最近の重大なできごと（7日間）</h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>日時</th><th>相手</th><th>内容</th><th>理由</th></tr></thead><tbody>
        {incidents.length === 0 ? <tr><td colSpan={4} className="muted">重大なできごとはありません。</td></tr>
          : incidents.map(({ s, handle }) => (
            <tr key={s.id}><td className="num">{ago(s.createdAt)}</td><td>@{handle}</td><td><span className="badge b-bad">{SANCTION_LABEL[s.kind]}</span></td><td>{s.reason}</td></tr>
          ))}
      </tbody></table></div>
    </>
  );
}
