import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { affiliateDomains, tags } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { maxUploadBytes, maxUploadSec, mediaProvider } from "@/lib/media";
import { PostForm } from "./PostForm";

export const metadata = { title: "投稿する" };

export default async function NewVideo() {
  const u = await requireUser("/creator/new");
  if (u.creatorStatus !== "approved") redirect("/creator/apply");
  const conn = await db();
  const [allTags, domains] = await Promise.all([
    conn.select({ name: tags.name }).from(tags).orderBy(tags.id),
    conn.select({ domain: affiliateDomains.domain, name: affiliateDomains.displayName }).from(affiliateDomains).where(eq(affiliateDomains.isActive, true)),
  ]);
  return (
    <div className="screen">
      <NavBar title="投稿する" back="/me" />
      <PostForm tags={allTags.map((t) => t.name)} domains={domains} upload={mediaProvider() ? { maxMb: Math.round(maxUploadBytes() / 1024 / 1024), maxSec: maxUploadSec() } : null} />
    </div>
  );
}
