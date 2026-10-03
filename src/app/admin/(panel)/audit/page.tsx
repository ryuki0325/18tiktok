import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, creatorPenalties, reportActions, users, videoConsents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { verifyChain } from "@/lib/ledger";

export const metadata = { title: "監査ログ" };

export default async function Audit() {
  await requireAdmin(["super_admin"]);
  const conn = await db();
  const [rows, ...broken] = await Promise.all([
    conn.select({ l: adminAuditLogs, handle: users.handle }).from(adminAuditLogs).leftJoin(users, eq(users.id, adminAuditLogs.adminId)).orderBy(desc(adminAuditLogs.id)).limit(200),
    verifyChain(conn, adminAuditLogs), verifyChain(conn, reportActions), verifyChain(conn, videoConsents), verifyChain(conn, creatorPenalties),
  ]);
  const names = ["監査ログ", "通報対応履歴", "同意記録", "制裁履歴"];
  return (
    <>
      <h1>監査ログ</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {names.map((n, i) => <span key={n} className={`badge ${broken[i] === null ? "b-ok" : "b-bad"}`}>{n}：{broken[i] === null ? "改ざんなし" : `ID ${broken[i]} で不整合`}</span>)}
      </div>
      <p className="cap">誰が・いつ・何を・どの対象に行ったかの記録です。追記のみで、更新・削除はデータベースが拒否します。各行は直前の行のハッシュとつながっています。</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>日時</th><th>担当</th><th>操作</th><th>対象</th><th>詳細</th></tr></thead><tbody>
        {rows.map(({ l, handle }) => (
          <tr key={l.id}><td className="num">{l.createdAt.toLocaleString("ja-JP")}</td><td>{handle ? `@${handle}` : "システム"}</td><td>{l.action}</td>
            <td className="cap">{l.targetType}{l.targetId ? `：${l.targetId.slice(0, 18)}` : ""}</td><td className="cap" style={{ maxWidth: 320, wordBreak: "break-all" }}>{l.detail ? JSON.stringify(l.detail) : ""}</td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}
