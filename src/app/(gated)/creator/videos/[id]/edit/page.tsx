import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { outboundLinks, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { EditForm } from "./EditForm";

export const metadata = { title: "投稿を編集" };

export default async function EditVideo({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("/creator/videos");
  const { id } = await params;
  const conn = await db();
  const [v] = await conn.select().from(videos).where(and(eq(videos.id, id), eq(videos.creatorId, u.id)));
  if (!v || v.status === "deleted") notFound();
  const [link] = await conn.select().from(outboundLinks).where(eq(outboundLinks.videoId, id));
  return (
    <div className="screen">
      <NavBar title="投稿を編集" back="/creator/videos" />
      <EditForm
        id={v.id}
        title={v.title}
        description={v.description}
        visibility={v.visibility === "private" ? "private" : "public"}
        comments={v.commentsEnabled}
        kind={v.kind}
        embedUrl={v.embedUrl}
        embedFit={v.embedFit}
        linkUrl={link?.url ?? ""}
      />
    </div>
  );
}
