import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { outboundLinks, tags, videoTags, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { EditForm } from "./EditForm";

export const metadata = { title: "投稿を編集" };

export default async function EditVideo({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("/creator/videos");
  const { id } = await params;
  const conn = await db();
  const [v] = await conn.select().from(videos).where(and(eq(videos.id, id), eq(videos.creatorId, u.id)));
  if (!v || v.status === "removed") notFound();
  const [allTags, mine, [link]] = await Promise.all([
    conn.select({ name: tags.name }).from(tags).orderBy(tags.id),
    conn.select({ name: tags.name }).from(videoTags).innerJoin(tags, eq(tags.id, videoTags.tagId)).where(eq(videoTags.videoId, id)),
    conn.select().from(outboundLinks).where(eq(outboundLinks.videoId, id)),
  ]);
  return (
    <div className="screen">
      <NavBar title="投稿を編集" back="/creator/videos" />
      <EditForm id={v.id} title={v.title} description={v.description} link={link?.url ?? ""} tags={allTags.map((t) => t.name)} selected={mine.map((t) => t.name)} published={v.status === "published"} />
    </div>
  );
}
