import { videosByTag } from "@/lib/content";
import { viewerContext } from "@/lib/viewer";
import { NavBar } from "@/components/NavBar";
import { VideoGrid } from "@/components/VideoGrid";
import { TabBar } from "@/components/TabBar";

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const ctx = await viewerContext();
  const tag = decodeURIComponent((await params).tag);
  const cards = await videosByTag(tag, ctx);
  return (
    <div className="screen with-nav">
      <NavBar title={`#${tag}`} back="/explore" />
      <div style={{ padding: "0 3px" }}><p className="cap" style={{ padding: "0 13px" }}>{cards.length}本の動画</p><VideoGrid cards={cards} /></div>
      <TabBar />
    </div>
  );
}
