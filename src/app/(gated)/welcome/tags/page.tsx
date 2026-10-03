import { db } from "@/db";
import { tags } from "@/db/schema";
import { viewerContext } from "@/lib/viewer";
import { TagPicker } from "./TagPicker";

export const metadata = { title: "好きなテーマ" };

export default async function WelcomeTags() {
  const ctx = await viewerContext();
  const all = await (await db()).select({ name: tags.name }).from(tags).orderBy(tags.id);
  return <TagPicker all={all.map((t) => t.name)} initial={ctx.preferredTags} />;
}
