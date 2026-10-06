import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tags, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { pendingTags } from "@/lib/tags";
import { tagAction } from "@/lib/admin-actions";
import { ago } from "@/components/format";

export const metadata = { title: "新しいタグ" };

/**
 * 投稿者が自分で作ったタグ。
 * 動画には付いているが、「探す」や人気タグには出ていない状態。
 * ここで「広げる」を押すとはじめて、ほかの人から見つけられるようになる。
 */
export default async function Tags() {
  await requireAdmin(["super_admin", "reviewer"]);
  const conn = await db();
  const rows = await pendingTags(conn);
  const made = await conn.select({ id: tags.id, handle: users.handle })
    .from(tags).leftJoin(users, eq(users.id, tags.createdBy)).where(eq(tags.status, "pending"));
  const by = new Map(made.map((m) => [m.id, m.handle]));

  return (
    <>
      <h1>新しいタグ<small className="cap">{rows.length}件</small></h1>
      <p className="cap" style={{ marginTop: -6 }}>
        広げるまでは、このタグで探すことはできません。言葉だけで決めず、実際に付いている動画も確かめてください。
      </p>
      {rows.length === 0 ? (
        <div className="card"><p className="cap">確認待ちのタグはありません。</p></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="tbl">
            <thead><tr><th>タグ</th><th>動画</th><th>作った人</th><th>作られた日</th><th /></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td><b>#{t.name}</b></td>
                  <td className="num">{t.n}</td>
                  <td className="cap">{by.get(t.id) ? `@${by.get(t.id)}` : "—"}</td>
                  <td className="cap num">{ago(t.createdAt)}</td>
                  <td>
                    <form action={tagAction} style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <input type="hidden" name="id" value={t.id} />
                      <a className="btn btn-sm btn-secondary" href={`/admin/videos?tag=${encodeURIComponent(t.name)}`}>動画を見る</a>
                      <button className="btn btn-sm btn-primary" name="op" value="approve">広げる</button>
                      <button className="btn btn-sm btn-danger" name="op" value="reject">広げない</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
