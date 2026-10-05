import { desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { creatorProfiles, userSanctions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { creatorDecisionAction, sanctionAction } from "@/lib/admin-actions";
import { SANCTION_LABEL } from "@/lib/safety";
import { ago } from "@/components/format";

export const metadata = { title: "投稿者" };

const ST: Record<string, [string, string]> = { pending: ["審査中", "b-warn"], approved: ["承認", "b-ok"], rejected: ["却下", "b-info"], suspended: ["一時停止", "b-bad"], banned: ["BAN", "b-bad"] };

export default async function Creators() {
  const me = await requireAdmin(["reviewer", "report_handler"]);
  const conn = await db();
  const rows = await conn.select({ p: creatorProfiles, u: users }).from(creatorProfiles).innerJoin(users, eq(users.id, creatorProfiles.userId)).orderBy(desc(creatorProfiles.appliedAt)).limit(200);
  const pending = rows.filter((r) => r.p.status === "pending");
  const others = rows.filter((r) => r.p.status !== "pending");
  const penalties = await conn.select().from(userSanctions).where(ne(userSanctions.kind, "warning")).orderBy(desc(userSanctions.id)).limit(20);
  const levels = (Object.keys(SANCTION_LABEL) as (keyof typeof SANCTION_LABEL)[]).filter((l) => me.role === "super_admin" || (l !== "ban" && l !== "lift"));
  return (
    <>
      <h1>投稿者</h1>
      <div className="notice info" style={{ marginBottom: 16 }}>本人確認書類の提出は、運用方針の決定待ちのため停止中です。申請内容とメール確認の状態で判断してください。</div>
      <h2 style={{ fontSize: 16 }}>申請 <span className="muted num">{pending.length}件</span></h2>
      <div className="tbl-wrap" style={{ marginBottom: 28 }}><table className="tbl"><thead><tr><th>ユーザー</th><th>メール確認</th><th>自己紹介</th><th>申請</th><th>判断</th></tr></thead><tbody>
        {pending.length === 0 && <tr><td colSpan={5} className="muted">申請はありません。</td></tr>}
        {pending.map(({ p, u }) => (
          <tr key={u.id}><td>@{u.handle}<div className="cap">{u.email}</div></td><td>{u.emailVerifiedAt ? "済" : <span style={{ color: "var(--bad)" }}>未</span>}</td><td style={{ maxWidth: 280 }}>{p.bio || "—"}</td><td className="cap">{ago(p.appliedAt)}</td>
            <td><form action={creatorDecisionAction} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><input type="hidden" name="id" value={u.id} />
              <button className="btn btn-sm btn-primary" name="decision" value="approve">承認</button>
              <input className="input" name="note" placeholder="却下理由" style={{ height: 36, width: 140, fontSize: 13 }} aria-label="却下理由" />
              <button className="btn btn-sm btn-danger" name="decision" value="reject">却下</button></form></td></tr>
        ))}
      </tbody></table></div>
      <h2 style={{ fontSize: 16 }}>投稿者一覧と制裁</h2>
      <p className="cap">警告 → 投稿制限 → 一時停止 → BAN の順。理由は投稿者に通知され、記録は改ざんできない形で残ります。</p>
      <div className="tbl-wrap" style={{ marginBottom: 28 }}><table className="tbl"><thead><tr><th>ユーザー</th><th>状態</th><th>承認本数</th><th>違反</th><th>制裁</th></tr></thead><tbody>
        {others.map(({ p, u }) => (
          <tr key={u.id}><td>@{u.handle}</td><td><span className={`badge ${ST[p.status][1]}`}>{ST[p.status][0]}</span>{p.restrictedUntil && p.restrictedUntil > new Date() && <div className="cap">制限中〜{p.restrictedUntil.toLocaleDateString("ja-JP")}</div>}</td>
            <td className="num">{p.approvedPosts}</td><td className="num">{p.violationPoints}</td>
            <td><form action={sanctionAction} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><input type="hidden" name="id" value={u.id} />
              <select className="input" name="kind" style={{ height: 36, width: "auto", fontSize: 13 }} aria-label="措置の種類">{levels.map((l) => <option key={l} value={l}>{SANCTION_LABEL[l]}</option>)}</select>
              <input className="input num" name="days" type="number" min={1} max={365} placeholder="日数" style={{ height: 36, width: 70, fontSize: 13 }} aria-label="日数" />
              <input className="input" name="reason" placeholder="理由（必須）" required style={{ height: 36, width: 160, fontSize: 13 }} aria-label="理由" />
              <button className="btn btn-sm btn-danger">実行</button></form></td></tr>
        ))}
      </tbody></table></div>
      <h2 style={{ fontSize: 16 }}>最近の制裁</h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>日時</th><th>種類</th><th>理由</th></tr></thead><tbody>
        {penalties.map((x) => <tr key={x.id}><td className="num">{x.createdAt.toLocaleString("ja-JP")}</td><td>{SANCTION_LABEL[x.kind]}</td><td>{x.reason}</td></tr>)}
      </tbody></table></div>
    </>
  );
}
