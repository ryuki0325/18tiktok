import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, moderationCases, reportActions, reports, users, videos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { caseAction } from "@/lib/admin-actions";
import { PRIORITY_LABEL, TARGET_LABEL, reasonLabel } from "@/lib/report-reasons";
import { requestTime } from "@/lib/settings";
import { ago } from "@/components/format";
import { EmergencyButtons } from "../EmergencyButtons";

export const metadata = { title: "対応キュー" };

const CLS: Record<string, string> = { critical: "b-bad", high: "b-warn", medium: "b-info", low: "b-info" };

/**
 * 通報と審査待ちをまとめた1本のキュー。
 * 緊急（critical）が必ず上に来るよう、優先度 → 期限の順に並べる。
 */
export default async function Cases({ searchParams }: { searchParams: Promise<{ p?: string; closed?: string }> }) {
  await requireAdmin(["report_handler"]);
  const now = requestTime();
  const sp = await searchParams;
  const showClosed = sp.closed === "1";
  const conn = await db();

  const rows = await conn.select().from(moderationCases)
    .where(showClosed ? eq(moderationCases.status, "closed") : inArray(moderationCases.status, ["open", "in_progress"]))
    // critical→high→medium→low の順。同じ優先度なら期限が近いものを先に
    .orderBy(sql`case ${moderationCases.priority} when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`,
      asc(moderationCases.dueAt), asc(moderationCases.createdAt))
    .limit(120);

  // 表示に必要な中身をまとめて引く
  const vIds = rows.filter((r) => r.targetType === "video").map((r) => r.targetId);
  const cIds = rows.filter((r) => r.targetType === "comment").map((r) => r.targetId);
  const uIds = [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => !!x))];
  const [vids, cmts, owners, allReports] = await Promise.all([
    vIds.length ? conn.select({ id: videos.id, title: videos.title, status: videos.status, hiddenReason: videos.hiddenReason }).from(videos).where(inArray(videos.id, vIds)) : [],
    cIds.length ? conn.select({ id: comments.id, body: comments.body, status: comments.status }).from(comments).where(inArray(comments.id, cIds)) : [],
    uIds.length ? conn.select({ id: users.id, handle: users.handle, status: users.status }).from(users).where(inArray(users.id, uIds)) : [],
    rows.length ? conn.select().from(reports).where(and(
      inArray(reports.targetId, rows.map((r) => r.targetId)), inArray(reports.status, ["open", "in_progress"]))) : [],
  ]);
  const vmap = new Map(vids.map((v) => [v.id, v]));
  const cmap = new Map(cmts.map((c) => [c.id, c]));
  const umap = new Map(owners.map((u) => [u.id, u]));
  const history = await conn.select().from(reportActions).orderBy(desc(reportActions.id)).limit(15);

  return (
    <>
      <h1>対応キュー <span className="muted num" style={{ fontSize: 15 }}>{showClosed ? "対応済み" : `未対応 ${rows.length}件`}</span></h1>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <Link className={`btn btn-sm ${showClosed ? "btn-secondary" : "btn-primary"}`} href="/admin/cases">未対応</Link>
        <Link className={`btn btn-sm ${showClosed ? "btn-primary" : "btn-secondary"}`} href="/admin/cases?closed=1">対応済み</Link>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.length === 0 && <p className="muted">{showClosed ? "対応済みの案件はありません。" : "未対応の案件はありません。"}</p>}
        {rows.map((c) => {
          const v = vmap.get(c.targetId);
          const cm = cmap.get(c.targetId);
          const owner = c.ownerId ? umap.get(c.ownerId) : undefined;
          const rs = allReports.filter((r) => r.targetId === c.targetId);
          const left = c.dueAt ? (c.dueAt.getTime() - now) / 3600_000 : null;
          const url = c.targetType === "video" ? `/?v=${c.targetId}` : owner ? `/u/${encodeURIComponent(owner.handle)}` : null;
          return (
            <div key={c.id} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, boxShadow: c.priority === "critical" ? "inset 4px 0 0 var(--bad)" : c.priority === "high" ? "inset 4px 0 0 var(--warn)" : undefined }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={`badge ${CLS[c.priority]}`}>{PRIORITY_LABEL[c.priority]}</span>
                <span className="badge b-info">{TARGET_LABEL[c.targetType]}</span>
                <b style={{ fontSize: 15 }}>{c.summary}</b>
                {c.reportCount > 1 && <span className="badge b-warn num">通報{c.reportCount}件</span>}
                {left !== null && !showClosed && (
                  <span className="num cap" style={{ color: left < 0 ? "var(--bad)" : left < 6 ? "var(--warn)" : undefined }}>
                    {left < 0 ? `期限を${Math.ceil(-left)}時間超過` : `期限まで${Math.floor(left)}時間`}
                  </span>
                )}
                {v?.status === "hidden" && <span className="badge b-bad">非公開中</span>}
                {cm?.status === "hidden_by_report" && <span className="badge b-bad">非表示中</span>}
              </div>
              <span className="cap">
                {owner ? <>投稿者 @{owner.handle}{owner.status !== "active" && `（${owner.status}）`}・</> : null}
                {ago(c.createdAt)}
                {url && <> ・<Link href={url} target="_blank" style={{ color: "var(--accent)" }}>対象を開く ↗</Link></>}
              </span>
              {cm && <p style={{ margin: 0, fontSize: 13.5, background: "var(--surface-2)", padding: 8, borderRadius: 8 }}>{cm.body}</p>}
              {rs.map((r) => (
                <div key={r.id} className="cap" style={{ background: "var(--surface-2)", padding: "6px 8px", borderRadius: 8 }}>
                  <b>{reasonLabel(r.reason)}</b>
                  {r.autoActioned && <span className="badge b-bad" style={{ marginLeft: 6 }}>自動で非公開済み</span>}
                  ・通報者 {r.reporterId ? "会員" : "匿名"}・{ago(r.createdAt)}
                  {r.description && <div style={{ marginTop: 4 }}>{r.description}</div>}
                </div>
              ))}
              {showClosed ? (
                <span className="cap">結果：{c.outcome}・{c.closedAt ? ago(c.closedAt) : ""}</span>
              ) : (
                <>
                  <form action={caseAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                    <input type="hidden" name="id" value={c.id} />
                    <input className="input" name="note" placeholder="対応メモ（投稿者への理由にもなります）" style={{ height: 34, maxWidth: 300, fontSize: 13 }} aria-label="対応メモ" />
                    <button className="btn btn-sm btn-secondary" name="decision" value="restore">問題なし・戻す</button>
                    <button className="btn btn-sm btn-secondary" name="decision" value="dismiss">却下</button>
                    <button className="btn btn-sm btn-danger" name="decision" value="remove">削除・非公開にする</button>
                  </form>
                  {c.ownerId && (
                    <details>
                      <summary className="cap" style={{ cursor: "pointer" }}>投稿者への措置</summary>
                      <div style={{ marginTop: 8 }}>
                        <EmergencyButtons targetId={c.ownerId} actions={["hide_all_videos", "ban_posting", "ban_comments", "suspend_user"]} compact />
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <h2 style={{ fontSize: 16, marginTop: 28 }}>最近の対応履歴（書き換えできない記録）</h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>日時</th><th>対応</th><th>メモ</th><th>担当</th></tr></thead><tbody>
        {history.length === 0 ? <tr><td colSpan={4} className="muted">まだ履歴はありません。</td></tr>
          : history.map((h) => <tr key={h.id}><td className="num">{h.createdAt.toLocaleString("ja-JP")}</td><td>{h.action}</td><td>{h.note}</td><td>{h.adminId ? "運営" : "自動"}</td></tr>)}
      </tbody></table></div>
    </>
  );
}
