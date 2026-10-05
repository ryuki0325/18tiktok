import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { destinations, tags, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { maxUploadBytes, maxUploadSec, mediaProvider } from "@/lib/media";
import { canPublish } from "@/lib/verification";
import { activeLimits } from "@/lib/safety";
import { Icon } from "@/components/Icon";
import { PostForm } from "./PostForm";

export const metadata = { title: "投稿する" };

export default async function NewVideo() {
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
    conn.select({ id: destinations.id, serviceName: destinations.serviceName, domain: destinations.domain })
      .from(destinations).where(eq(destinations.status, "approved")).orderBy(destinations.serviceName),
    conn.select({ id: videos.id, title: videos.title, poster: videos.thumbnailUrl, hue: videos.hue })
      .from(videos).where(and(eq(videos.creatorId, u.id), eq(videos.status, "draft"))).orderBy(desc(videos.createdAt)).limit(10),
  ]);

  return (
    <div className="screen">
      <NavBar title="投稿する" back="/me" />
      {blockedReason ? (
        <div className="sec">
          <div className="notice bad" role="status"><Icon name="alert" size={18} /><span>{blockedReason}</span></div>
        </div>
      ) : (
        <PostForm
          tags={allTags.map((t) => t.name)}
          destinations={dests}
          drafts={drafts}
          upload={mediaProvider() ? { maxMb: Math.round(maxUploadBytes() / 1024 / 1024), maxSec: maxUploadSec() } : null}
        />
      )}
    </div>
  );
}
