import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { outboundLinks, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { myVideoAction } from "@/lib/creator-actions";
import { NavBar } from "@/components/NavBar";
import { Icon } from "@/components/Icon";
import { Thumb } from "@/components/VideoBackdrop";
import { ago } from "@/components/format";
import { statusLabel } from "@/components/status";

export const metadata = { title: "自分の投稿" };


export default async function MyVideos({ searchParams }: { searchParams: Promise<{ submitted?: string; linkPending?: string; edited?: string; rereview?: string }> }) {
  const u = await requireUser("/creator/videos");
  const sp = await searchParams;
  const rows = await (await db()).select({ v: videos, link: outboundLinks.status }).from(videos).leftJoin(outboundLinks, eq(outboundLinks.videoId, videos.id))
    .where(eq(videos.creatorId, u.id)).orderBy(desc(videos.createdAt));
  return (
    <div className="screen">
      <NavBar title="自分の投稿" back="/me" right={<Link className="iconbtn" href="/creator/new" aria-label="投稿する"><Icon name="plus" /></Link>} />
      <div className="sec" style={{ gap: 12, paddingBottom: 24 }}>
        {sp.edited && <div className="notice info" role="status"><Icon name="check" size={18} /><span>保存しました。{sp.rereview && "外部リンクを変更したため、再審査が終わるまで非公開になります。"}</span></div>}
        {sp.submitted && <div className="notice info" role="status"><Icon name="check" size={18} /><span>審査に提出しました。結果は「お知らせ」でお届けします。{sp.linkPending && "外部リンクは、ドメインの審査が通るまで表示されません。"}</span></div>}
        {rows.length === 0 ? <p className="cap" style={{ textAlign: "center", padding: 40 }}>まだ投稿はありません。</p> : (
          <div className="list">
            {rows.filter((r) => r.v.status !== "deleted").map(({ v, link }) => {
              const [label, cls] = statusLabel(v.status, v.hiddenReason);
              return (
                <div key={v.id} className="row" style={{ alignItems: "flex-start", padding: "14px 16px", gap: 12 }}>
                  <span className="sth"><Thumb card={{ hue: v.hue, poster: v.thumbnailUrl }} /></span>
                  <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}><b style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</b><span className={`badge ${cls}`}>{label}</span></div>
                    <span className="cap">{ago(v.createdAt)}{v.mediaStatus === "processing" && "・動画を変換中"}{v.mediaStatus === "failed" && "・動画の変換に失敗"}{link === "pending_domain_review" && "・リンク審査中"}{!v.commentsEnabled && "・コメントオフ"}</span>
                    {v.statusReason && v.status !== "published" && <span className="cap" style={{ color: v.status === "pending_review" ? undefined : "var(--bad)" }}>{v.status === "pending_review" ? "" : "理由："}{v.statusReason}</span>}
                    <form action={myVideoAction} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                      <input type="hidden" name="id" value={v.id} />
                      {v.status === "published" && <button className="btn btn-sm btn-secondary" name="op" value="hide">非公開にする</button>}
                      {v.status === "hidden" && <button className="btn btn-sm btn-secondary" name="op" value="show">公開に戻す</button>}
                      {v.status === "published" && <button className="btn btn-sm btn-secondary" name="op" value="comments">{v.commentsEnabled ? "コメントをオフ" : "コメントをオン"}</button>}
                      {v.status === "draft"
                        ? <Link className="btn btn-sm btn-primary" href={`/creator/new?draft=${v.id}`}>続きを書く</Link>
                        : <Link className="btn btn-sm btn-secondary" href={`/creator/videos/${v.id}/edit`}>編集</Link>}
                      <button className="btn btn-sm btn-danger" name="op" value="delete">削除</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
