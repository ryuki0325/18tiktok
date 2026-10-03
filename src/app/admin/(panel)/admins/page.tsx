import { ne, asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { setAdminRoleAction } from "@/lib/admin-actions";

export const metadata = { title: "管理者" };

const ROLES: [string, string][] = [["super_admin", "スーパー管理者"], ["reviewer", "審査担当"], ["report_handler", "通報対応担当"]];

export default async function Admins() {
  const me = await requireAdmin(["super_admin"]);
  const rows = await (await db()).select().from(users).where(ne(users.role, "user")).orderBy(asc(users.createdAt));
  return (
    <>
      <h1>管理者</h1>
      <p className="cap">役割ごとにできることが分かれています。追加された人は、次のログイン時に2段階認証の登録が必要です。役割を変えるとその人はログアウトされます。</p>
      <form action={setAdminRoleAction} className="card" style={{ padding: 14, display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <input className="input" name="email" type="email" placeholder="登録済みユーザーのメールアドレス" required style={{ height: 40, maxWidth: 300 }} aria-label="メールアドレス" />
        <select className="input" name="role" style={{ height: 40, width: "auto" }} aria-label="役割">{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="btn btn-sm btn-primary" style={{ height: 40 }}>管理者にする</button>
      </form>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>ユーザー</th><th>役割</th><th>2段階認証</th><th>変更</th></tr></thead><tbody>
        {rows.map((u) => (
          <tr key={u.id}><td>@{u.handle}<div className="cap">{u.email}</div></td><td>{ROLES.find(([k]) => k === u.role)?.[1]}</td><td>{u.totpEnabled ? "登録済み" : <span style={{ color: "var(--warn)" }}>未登録</span>}</td>
            <td>{u.id === me.id ? <span className="cap">自分</span> : (
              <form action={setAdminRoleAction} style={{ display: "flex", gap: 6 }}><input type="hidden" name="id" value={u.id} />
                <select className="input" name="role" defaultValue={u.role} style={{ height: 34, width: "auto", fontSize: 13 }} aria-label="役割">{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="user">管理者から外す</option></select>
                <button className="btn btn-sm btn-secondary">保存</button></form>)}</td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}
