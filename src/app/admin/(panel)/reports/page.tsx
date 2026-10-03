import { requestTime } from "@/lib/settings";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { reportActions, reportTickets, users, videos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { reportAction } from "@/lib/admin-actions";
import { REASON_LABEL } from "@/lib/moderation";
import { VideoBackdrop } from "@/components/VideoBackdrop";
import { ago } from "@/components/format";

export const metadata = { title: "通報" };

/** 優先度（未成年・非同意が最優先）→ 対応期限の順 */
export default async function Reports() {
  const now = requestTime();
  await requireAdmin(["report_handler"]);
  const conn = await db();
  const open = await conn.select({ r: reportTickets, title: videos.title, status: videos.status, hue: videos.hue, handle: users.handle })
    .from(reportTickets).innerJoin(videos, eq(videos.id, reportTickets.videoId)).innerJoin(users, eq(users.id, videos.creatorId))
    .where(eq(reportTickets.status, "open")).orderBy(asc(reportTickets.priority), asc(reportTickets.slaDueAt)).limit(100);
  const history = await conn.select().from(reportActions).orderBy(desc(reportActions.id)).limit(15);
  const ids = open.map((o) => o.r.id);
  const acts = ids.length ? await conn.select().from(reportActions).where(inArray(reportActions.ticketId, ids)) : [];
  return (
    <>
      <h1>通報 <span className="muted num" style={{ fontSize: 15 }}>未対応 {open.length}件</span></h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {open.length === 0 && <p className="muted">未対応の通報はありません。</p>}
        {open.map(({ r, title, status, hue, handle }) => {
          const left = (r.slaDueAt.getTime() - now) / 3600_000;
          return (
            <div key={r.id} className="card" style={{ padding: 14, display: "grid", gridTemplateColumns: "64px 1fr", gap: 14, boxShadow: r.priority === "P0" ? "inset 3px 0 0 var(--bad)" : undefined }}>
              <div style={{ width: 64, height: 100, borderRadius: 10, position: "relative", overflow: "hidden" }}><VideoBackdrop hue={hue} /></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`badge ${r.priority === "P0" ? "b-bad" : r.priority === "P1" ? "b-warn" : "b-info"}`}>{r.priority}</span>
                  <b>{REASON_LABEL[r.reason]}</b>
                  <span className="num cap" style={{ color: left < 0 ? "var(--bad)" : left < 6 ? "var(--warn)" : undefined }}>{left < 0 ? `期限を${Math.ceil(-left)}時間超過` : `期限まで${Math.floor(left)}時間`}</span>
                  {status === "hidden_by_report" && <span className="badge b-info">非公開中</span>}
                </div>
                <span className="cap">「{title}」@{handle}・{ago(r.createdAt)}・通報者 {r.reporterKey.startsWith("u:") ? "会員" : "匿名"}</span>
                {r.detail && <p style={{ margin: 0, fontSize: 13.5, background: "var(--surface-2)", padding: 8, borderRadius: 8 }}>{r.detail}</p>}
                {acts.filter((a) => a.ticketId === r.id).map((a) => <span key={a.id} className="cap">履歴：{a.action}{a.note ? `（${a.note}）` : ""}・{ago(a.createdAt)}</span>)}
                <form action={reportAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <input type="hidden" name="id" value={r.id} />
                  <input className="input" name="note" placeholder="対応メモ（投稿者への理由にもなります）" style={{ height: 36, maxWidth: 320, fontSize: 13 }} aria-label="対応メモ" />
                  <button className="btn btn-sm btn-secondary" name="decision" value="restore">問題なし・公開に戻す</button>
                  <button className="btn btn-sm btn-secondary" name="decision" value="dismiss">却下（動画はそのまま）</button>
                  <button className="btn btn-sm btn-danger" name="decision" value="remove">動画を削除</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
      <h2 style={{ fontSize: 16, marginTop: 28 }}>最近の対応履歴（改ざんできない記録）</h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>日時</th><th>対応</th><th>メモ</th><th>担当</th></tr></thead><tbody>
        {history.map((h) => <tr key={h.id}><td className="num">{h.createdAt.toLocaleString("ja-JP")}</td><td>{h.action}</td><td>{h.note}</td><td>{h.adminId ? "運営" : "自動"}</td></tr>)}
      </tbody></table></div>
    </>
  );
}
