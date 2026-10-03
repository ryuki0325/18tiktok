import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { comments, users, videos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { commentModerationAction } from "@/lib/admin-actions";
import { ago } from "@/components/format";

export const metadata = { title: "コメント" };

export default async function Comments() {
  await requireAdmin(["report_handler"]);
  const rows = await (await db()).select({ c: comments, handle: users.handle, title: videos.title }).from(comments)
    .innerJoin(users, eq(users.id, comments.userId)).innerJoin(videos, eq(videos.id, comments.videoId))
    .where(inArray(comments.status, ["pending", "hidden_by_report"])).orderBy(desc(comments.createdAt)).limit(200);
  return (
    <>
      <h1>コメント <span className="muted num" style={{ fontSize: 15 }}>{rows.length}件</span></h1>
      <p className="cap">NGワードに当たったもの（確認待ち）と、通報で非表示になったものです。NGワードは「設定」で変更できます。</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>状態</th><th>コメント</th><th>投稿者・動画</th><th>対応</th></tr></thead><tbody>
        {rows.length === 0 && <tr><td colSpan={4} className="muted">対応が必要なコメントはありません。</td></tr>}
        {rows.map(({ c, handle, title }) => (
          <tr key={c.id}><td><span className={`badge ${c.status === "pending" ? "b-warn" : "b-bad"}`}>{c.status === "pending" ? "確認待ち" : "通報で非表示"}</span></td>
            <td style={{ maxWidth: 360 }}>{c.body}</td><td className="cap">@{handle}<br />「{title}」・{ago(c.createdAt)}</td>
            <td><form action={commentModerationAction} style={{ display: "flex", gap: 6 }}><input type="hidden" name="id" value={c.id} />
              <button className="btn btn-sm btn-secondary" name="decision" value="show">表示する</button>
              <button className="btn btn-sm btn-danger" name="decision" value="remove">削除</button></form></td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}
