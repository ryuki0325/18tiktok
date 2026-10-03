import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { featuredSlots, users, videos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { addFeaturedAction, removeFeaturedAction } from "@/lib/admin-actions";
import { requestTime } from "@/lib/settings";

export const metadata = { title: "特集枠" };

export default async function Featured() {
  await requireAdmin(["super_admin"]);
  const now = requestTime();
  const conn = await db();
  const [slots, candidates] = await Promise.all([
    conn.select({ f: featuredSlots, title: videos.title, handle: users.handle }).from(featuredSlots).innerJoin(videos, eq(videos.id, featuredSlots.videoId)).innerJoin(users, eq(users.id, videos.creatorId)).orderBy(asc(featuredSlots.position), desc(featuredSlots.createdAt)),
    conn.select({ id: videos.id, title: videos.title, handle: users.handle }).from(videos).innerJoin(users, eq(users.id, videos.creatorId)).where(eq(videos.status, "published")).orderBy(desc(videos.publishedAt)).limit(200),
  ]);
  return (
    <>
      <h1>特集枠</h1>
      <p className="cap">「探す」画面の上部に、選んだ動画を期間を決めて表示します。設定がないときは週間ランキング1位を自動で表示します。</p>
      <form action={addFeaturedAction} className="card" style={{ padding: 14, display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
        <select className="input" name="videoId" required style={{ height: 40, maxWidth: 360 }} aria-label="動画">{candidates.map((c) => <option key={c.id} value={c.id}>{c.title}（@{c.handle}）</option>)}</select>
        <input className="input" name="title" placeholder="見出し（例：今週の特集）" style={{ height: 40, maxWidth: 220 }} aria-label="見出し" />
        <input className="input num" name="days" type="number" min={1} max={90} defaultValue={7} style={{ height: 40, width: 80 }} aria-label="表示日数" />
        <span className="cap">日間</span>
        <input className="input num" name="position" type="number" min={0} max={99} defaultValue={0} style={{ height: 40, width: 70 }} aria-label="並び順" />
        <span className="cap">番目</span>
        <button className="btn btn-sm btn-primary" style={{ height: 40 }}>追加</button>
      </form>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>順</th><th>動画</th><th>見出し</th><th>期間</th><th>状態</th><th /></tr></thead><tbody>
        {slots.length === 0 && <tr><td colSpan={6} className="muted">特集枠はありません。</td></tr>}
        {slots.map(({ f, title, handle }) => {
          const live = f.startsAt.getTime() <= now && (!f.endsAt || f.endsAt.getTime() > now);
          return (
            <tr key={f.id}><td className="num">{f.position}</td><td>{title}<div className="cap">@{handle}</div></td><td>{f.title || "—"}</td>
              <td className="cap num">{f.startsAt.toLocaleDateString("ja-JP")}〜{f.endsAt?.toLocaleDateString("ja-JP") ?? ""}</td>
              <td><span className={`badge ${live ? "b-ok" : "b-info"}`}>{live ? "表示中" : "期間外"}</span></td>
              <td><form action={removeFeaturedAction}><input type="hidden" name="id" value={f.id} /><button className="btn btn-sm btn-danger">外す</button></form></td></tr>
          );
        })}
      </tbody></table></div>
    </>
  );
}
