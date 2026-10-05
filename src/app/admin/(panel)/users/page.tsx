import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { creatorProfiles, userSanctions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { sanctionAction } from "@/lib/admin-actions";
import { activeLimits, SANCTION_LABEL } from "@/lib/safety";
import { ago } from "@/components/format";

export const metadata = { title: "利用者" };

/**
 * 利用者の管理。投稿者でない人にも措置ができる。
 * 【プライバシー】ここに出すのは運営の判断に必要な分だけ。閲覧履歴や端末の情報は扱わない。
 */
export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const a = await requireAdmin(["report_handler"]);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 50);
  const filter = sp.f ?? "all";
  const conn = await db();

  const where = q
    ? or(ilike(users.handle, `%${q}%`), ilike(users.displayName, `%${q}%`))
    : filter === "sanctioned" ? sql`${users.status} <> 'active' or ${users.postBannedUntil} > now() or ${users.commentBannedUntil} > now()`
      : filter === "creators" ? sql`exists (select 1 from creator_profiles cp where cp.user_id = ${users.id} and cp.status = 'approved')`
        : undefined;

  const rows = await conn.select({
    u: users,
    creator: creatorProfiles.status,
    sanctions: sql<number>`(select count(*) from user_sanctions sx where sx.user_id = ${users.id} and sx.kind <> 'lift')::int`,
  }).from(users).leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(where).orderBy(desc(users.createdAt)).limit(60);

  const recent = await conn.select({ s: userSanctions, handle: users.handle })
    .from(userSanctions).innerJoin(users, eq(users.id, userSanctions.userId))
    .orderBy(desc(userSanctions.id)).limit(15);

  const TABS: [string, string][] = [["all", "すべて"], ["creators", "投稿者"], ["sanctioned", "措置中"]];
  return (
    <>
      <h1>利用者</h1>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(([k, l]) => <a key={k} className={`btn btn-sm ${filter === k && !q ? "btn-primary" : "btn-secondary"}`} href={k === "all" ? "/admin/users" : `/admin/users?f=${k}`}>{l}</a>)}
        <form style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <input className="input" name="q" defaultValue={q} placeholder="@名前・表示名で検索" style={{ height: 34, width: 220, fontSize: 13 }} aria-label="利用者を検索" />
          <button className="btn btn-sm btn-secondary">検索</button>
        </form>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.length === 0 && <p className="muted">該当する利用者はいません。</p>}
        {rows.map(({ u, creator, sanctions }) => {
          const lim = activeLimits(u);
          return (
            <div key={u.id} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b>@{u.handle}</b>
                {creator === "approved" && <span className="badge b-ok">投稿者</span>}
                {u.role !== "user" && <span className="badge b-info">運営</span>}
                {lim.banned && <span className="badge b-bad">永久停止</span>}
                {lim.suspended && <span className="badge b-bad">一時停止</span>}
                {lim.postBanned && <span className="badge b-warn">投稿停止</span>}
                {lim.commentBanned && <span className="badge b-warn">コメント停止</span>}
                {sanctions > 0 && <span className="badge b-warn num">違反{sanctions}件</span>}
                <span className="cap" style={{ marginLeft: "auto" }}>登録 {ago(u.createdAt)}</span>
              </div>
              <span className="cap">年齢の状態：{{ unknown: "未確認", age_verified: "確認済み", age_restricted: "成人向けを表示しない" }[u.ageStatus]}</span>
              {u.role === "user" && (
                <form action={sanctionAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input type="hidden" name="id" value={u.id} />
                  <input className="input" name="reason" placeholder="理由（必須・本人にも通知されます）" style={{ height: 34, maxWidth: 260, fontSize: 13 }} required aria-label="理由" />
                  <input className="input num" name="days" type="number" min={0} placeholder="日数" style={{ height: 34, width: 80, fontSize: 13 }} aria-label="日数（空欄で無期限）" />
                  <button className="btn btn-sm btn-secondary" name="kind" value="warning">警告</button>
                  <button className="btn btn-sm btn-secondary" name="kind" value="post_ban">投稿停止</button>
                  <button className="btn btn-sm btn-secondary" name="kind" value="comment_ban">コメント停止</button>
                  <button className="btn btn-sm btn-danger" name="kind" value="suspend">一時停止</button>
                  {a.role === "super_admin" && <button className="btn btn-sm btn-danger" name="kind" value="ban">永久停止</button>}
                  {a.role === "super_admin" && <button className="btn btn-sm btn-secondary" name="kind" value="lift">解除</button>}
                </form>
              )}
            </div>
          );
        })}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 28 }}>最近の措置（書き換えできない記録）</h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>日時</th><th>相手</th><th>措置</th><th>理由</th><th>期限</th></tr></thead><tbody>
        {recent.length === 0 ? <tr><td colSpan={5} className="muted">まだ記録はありません。</td></tr>
          : recent.map(({ s, handle }) => (
            <tr key={s.id}><td className="num">{s.createdAt.toLocaleString("ja-JP")}</td><td>@{handle}</td>
              <td>{SANCTION_LABEL[s.kind]}</td><td>{s.reason}</td><td className="num">{s.endsAt ? s.endsAt.toLocaleDateString("ja-JP") : "—"}</td></tr>
          ))}
      </tbody></table></div>
    </>
  );
}
