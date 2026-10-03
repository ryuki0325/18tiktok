import { desc } from "drizzle-orm";
import { db } from "@/db";
import { takedownRequests } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { takedownStatusAction } from "@/lib/admin-actions";
import { ago } from "@/components/format";

export const metadata = { title: "削除請求" };

const ST: Record<string, [string, string]> = { received: ["受付", "b-warn"], investigating: ["調査中", "b-warn"], actioned: ["対応済み", "b-ok"], answered: ["回答済み", "b-ok"], rejected: ["対応しない", "b-info"] };

export default async function Takedowns() {
  await requireAdmin(["report_handler"]);
  const rows = await (await db()).select().from(takedownRequests).orderBy(desc(takedownRequests.createdAt)).limit(200);
  return (
    <>
      <h1>削除請求・権利侵害の申告</h1>
      <p className="cap">受付 → 調査 → 対応 → 回答。動画の非公開・削除は「通報」画面か投稿者管理から行ってください。</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>受付番号</th><th>状態</th><th>種類</th><th>申告者</th><th>対象・内容</th><th>更新</th></tr></thead><tbody>
        {rows.length === 0 && <tr><td colSpan={6} className="muted">申告はありません。</td></tr>}
        {rows.map((r) => (
          <tr key={r.id}><td className="num">{r.receipt}<div className="cap">{ago(r.createdAt)}</div></td><td><span className={`badge ${ST[r.status][1]}`}>{ST[r.status][0]}</span></td>
            <td>{r.claimType}</td><td>{r.name}（{r.requesterType}）<div className="cap">{r.email}</div></td>
            <td style={{ maxWidth: 320 }}><div className="cap" style={{ wordBreak: "break-all" }}>{r.targetUrl}</div>{r.detail}</td>
            <td><form action={takedownStatusAction} style={{ display: "flex", gap: 6, flexDirection: "column" }}><input type="hidden" name="id" value={r.id} />
              <select className="input" name="status" defaultValue={r.status} style={{ height: 34, fontSize: 13 }} aria-label="状態">{["investigating", "actioned", "answered", "rejected"].map((s) => <option key={s} value={s}>{ST[s][0]}</option>)}</select>
              <input className="input" name="note" placeholder="メモ" style={{ height: 34, fontSize: 13 }} aria-label="メモ" />
              <button className="btn btn-sm btn-secondary">更新</button></form></td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}
