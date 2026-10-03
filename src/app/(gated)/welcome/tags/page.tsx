import { viewerContext } from "@/lib/viewer";
import { TagPicker } from "./TagPicker";

export const metadata = { title: "はじめに" };

export default async function Welcome() {
  const ctx = await viewerContext();
  return <TagPicker initialTags={ctx.preferredTags} initialAudience={ctx.audience} />;
}
