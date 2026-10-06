import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { outboundLinks, tags, videoTags, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { canTrim, maxUploadBytes, maxUploadSec, mediaProvider } from "@/lib/media";
import { canPublish } from "@/lib/verification";
import { postableDestinations } from "@/lib/affiliates";
import { activeLimits } from "@/lib/safety";
import { Icon } from "@/components/Icon";
import { PostForm } from "./PostForm";

export const metadata = { title: "投稿する" };

export default async function NewVideo({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const sp = await searchParams;
  const u = await requireUser("/creator/new");
  if (u.creatorStatus !== "approved") redirect("/creator/apply");
  const conn = await db();

  // 投稿できない状態（停止中・年齢の確認が未了）は、理由を出して止める
  const limits = activeLimits(u);
  const v = await canPublish(u.id, conn);
  const blockedReason = limits.banned || limits.suspended ? "現在アカウントが停止されています。"
    : limits.postBanned ? "投稿を停止されています。解除まで投稿できません。"
      : !v.ok ? v.reason : null;

  const [allTags, dests, drafts] = await Promise.all([
    conn.select({ name: tags.name }).from(tags).orderBy(tags.id),
    // 送客先は、自分がアフィリエイトIDを登録しているサービスだけ
    postableDestinations(conn, u.id),
    conn.select({ id: videos.id, title: videos.title, poster: videos.thumbnailUrl, hue: videos.hue })
      .from(videos).where(and(eq(videos.creatorId, u.id), eq(videos.status, "draft"))).orderBy(desc(videos.createdAt)).limit(10),
  ]);

  // 「下書きの続きから」。自分の下書きだけ開ける
  const draftId = sp.draft && /^[0-9a-f-]{36}$/.test(sp.draft) ? sp.draft : null;
  let resume = null as null | {
    id: string; caption: string; tags: string[]; category: string | null; intensity: number | null;
    visibility: "public" | "private"; comments: boolean; poster: string | null; hasMedia: boolean;
    destId: string; linkUrl: string;
  };
  if (draftId) {
    const [d] = await conn.select().from(videos)
      .where(and(eq(videos.id, draftId), eq(videos.creatorId, u.id), eq(videos.status, "draft")));
    if (d) {
      const [dt, lk] = await Promise.all([
        conn.select({ name: tags.name }).from(videoTags).innerJoin(tags, eq(tags.id, videoTags.tagId)).where(eq(videoTags.videoId, d.id)),
        conn.select({ url: outboundLinks.url, destinationId: outboundLinks.destinationId }).from(outboundLinks).where(eq(outboundLinks.videoId, d.id)),
      ]);
      resume = {
        id: d.id,
        caption: d.description || d.title || "",
        tags: dt.map((x) => x.name),
        category: d.category, intensity: d.intensity,
        visibility: d.visibility === "private" ? "private" : "public",
        comments: d.commentsEnabled,
        poster: d.thumbnailUrl, hasMedia: d.mediaStatus !== "none",
        destId: lk[0]?.destinationId ?? "", linkUrl: lk[0]?.url ?? "",
      };
    }
  }

  return (
    <div className="screen">
      <NavBar title="投稿する" back="/me" />
      {blockedReason ? (
        <div className="sec">
          <div className="notice bad" role="status"><Icon name="alert" size={18} /><span>{blockedReason}</span></div>
        </div>
      ) : (
        <PostForm
          /* 下書きを開き直したときに中身を入れ替えるため、下書きごとに作り直す */
          key={resume?.id ?? "new"}
          tags={allTags.map((t) => t.name)}
          destinations={dests}
          drafts={drafts}
          resume={resume}
          upload={mediaProvider() ? { maxMb: Math.round(maxUploadBytes() / 1024 / 1024), maxSec: maxUploadSec(), canTrim: canTrim() } : null}
        />
      )}
    </div>
  );
}
