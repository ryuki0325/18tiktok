import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { affiliateDomains, outboundLinks, users, videos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { addDomainAction, removeDomainAction } from "@/lib/admin-actions";

export const metadata = { title: "許可ドメイン" };

export default async function Domains() {
  await requireAdmin(["super_admin"]);
  const conn = await db();
  const [list, pending] = await Promise.all([
    conn.select().from(affiliateDomains).orderBy(desc(affiliateDomains.isActive), affiliateDomains.domain),
    conn.select({ l: outboundLinks, title: videos.title, handle: users.handle }).from(outboundLinks).innerJoin(videos, eq(videos.id, outboundLinks.videoId)).innerJoin(users, eq(users.id, videos.creatorId))
      .where(eq(outboundLinks.status, "pending_domain_review")).orderBy(desc(outboundLinks.createdAt)),
  ]);
  return (
    <>
      <h1>許可ドメイン</h1>
      <p className="cap">投稿者が貼れるのは、ここで有効にしたドメインのURLだけです。外すと、そのドメインのリンクはすべて自動で無効になります。</p>
      <form action={addDomainAction} className="card" style={{ padding: 14, display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <input className="input" name="domain" placeholder="例）partner.example.jp" required style={{ height: 40, maxWidth: 260 }} aria-label="ドメイン" />
        <input className="input" name="name" placeholder="表示名" style={{ height: 40, maxWidth: 200 }} aria-label="表示名" />
        <button className="btn btn-sm btn-primary" style={{ height: 40 }}>追加・有効化</button>
      </form>
      <div className="tbl-wrap" style={{ marginBottom: 28 }}><table className="tbl"><thead><tr><th>ドメイン</th><th>表示名</th><th>状態</th><th /></tr></thead><tbody>
        {list.map((d) => (
          <tr key={d.id}><td className="num">{d.domain}</td><td>{d.displayName}</td><td><span className={`badge ${d.isActive ? "b-ok" : "b-info"}`}>{d.isActive ? "有効" : "無効"}</span></td>
            <td>{d.isActive && <form action={removeDomainAction}><input type="hidden" name="id" value={d.id} /><button className="btn btn-sm btn-danger">外す</button></form>}</td></tr>
        ))}
      </tbody></table></div>
      <h2 style={{ fontSize: 16 }}>URL審査（許可リスト外） <span className="muted num">{pending.length}件</span></h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>URL</th><th>動画</th><th>対応</th></tr></thead><tbody>
        {pending.length === 0 && <tr><td colSpan={3} className="muted">審査待ちのURLはありません。</td></tr>}
        {pending.map(({ l, title, handle }) => (
          <tr key={l.id}><td className="num" style={{ wordBreak: "break-all", maxWidth: 360 }}>{l.url}</td><td className="cap">「{title}」@{handle}</td>
            <td><form action={addDomainAction}><input type="hidden" name="domain" value={l.domain} /><input type="hidden" name="name" value={l.domain} /><button className="btn btn-sm btn-primary">{l.domain} を許可</button></form></td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}
