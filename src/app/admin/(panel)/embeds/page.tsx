import { desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { embedSources, users, videos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { addEmbedSourceAction, removeEmbedSourceAction } from "@/lib/admin-actions";
import { ago } from "@/components/format";

export const metadata = { title: "埋め込み元" };

/**
 * 埋め込みできる「出どころ」の管理。
 * 投稿者が動画に使える埋め込みURLは、ここで有効にしたホスト（公式サンプル等）のものだけ。
 * ＝ 無断転載の拡散を防ぐ出どころ審査。
 */
export default async function Embeds() {
  await requireAdmin(["super_admin"]);
  const conn = await db();
  const [list, recent] = await Promise.all([
    conn.select().from(embedSources).orderBy(desc(embedSources.isActive), embedSources.domain),
    conn.select({ id: videos.id, title: videos.title, handle: users.handle, domain: videos.embedDomain, createdAt: videos.createdAt, status: videos.status })
      .from(videos).innerJoin(users, eq(users.id, videos.creatorId))
      .where(isNotNull(videos.embedUrl)).orderBy(desc(videos.createdAt)).limit(30),
  ]);
  return (
    <>
      <h1>埋め込み元</h1>
      <p className="cap">
        動画は自社に保存せず、ここで有効にした<b>出どころ（公式サンプル等）</b>のURLだけを埋め込めます。
        外すと、それ以降は新しくそのホストのURLを投稿できません。
      </p>
      <form action={addEmbedSourceAction} className="card" style={{ padding: 14, display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <input className="input" name="domain" placeholder="例）www.dmm.co.jp" required style={{ height: 40, maxWidth: 260 }} aria-label="ホスト" />
        <input className="input" name="name" placeholder="表示名（例：FANZA 公式サンプル）" style={{ height: 40, maxWidth: 240 }} aria-label="表示名" />
        <button className="btn btn-sm btn-primary" style={{ height: 40 }}>追加・有効化</button>
      </form>
      <div className="tbl-wrap" style={{ marginBottom: 28 }}><table className="tbl"><thead><tr><th>ホスト</th><th>表示名</th><th>状態</th><th /></tr></thead><tbody>
        {list.length === 0 && <tr><td colSpan={4} className="muted">まだ登録されていません。上のフォームから、公式サンプル等の出どころを追加してください。</td></tr>}
        {list.map((d) => (
          <tr key={d.id}><td className="num">{d.domain}</td><td>{d.displayName}</td>
            <td><span className={`badge ${d.isActive ? "b-ok" : "b-info"}`}>{d.isActive ? "有効" : "無効"}</span></td>
            <td>{d.isActive && <form action={removeEmbedSourceAction}><input type="hidden" name="id" value={d.id} /><button className="btn btn-sm btn-danger">外す</button></form>}</td></tr>
        ))}
      </tbody></table></div>

      <h2 style={{ fontSize: 16 }}>最近の埋め込み投稿 <span className="muted num">{recent.length}件</span></h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>投稿</th><th>投稿者</th><th>出どころ</th><th>状態</th><th>日時</th></tr></thead><tbody>
        {recent.length === 0 && <tr><td colSpan={5} className="muted">まだ埋め込み投稿はありません。</td></tr>}
        {recent.map((r) => (
          <tr key={r.id}><td>{r.title}</td><td className="cap">@{r.handle}</td><td className="num">{r.domain ?? "—"}</td>
            <td className="cap">{r.status}</td><td className="num">{ago(r.createdAt)}</td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}
