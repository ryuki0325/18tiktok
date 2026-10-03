import Link from "next/link";
import type { VideoCard } from "@/lib/content";
import { Icon } from "./Icon";
import { VideoBackdrop } from "./VideoBackdrop";
import { fmt } from "./format";

export function VideoGrid({ cards, empty }: { cards: VideoCard[]; empty?: React.ReactNode }) {
  if (!cards.length) return <>{empty ?? <p className="cap" style={{ textAlign: "center", padding: "40px 0" }}>動画はまだありません。</p>}</>;
  return (
    <div className="thumbs">
      {cards.map((c) => (
        <Link key={c.id} className="thumb" href={`/?v=${c.id}`} aria-label={c.title}>
          <VideoBackdrop hue={c.hue} still soft />
          <span className="meta"><Icon name="heart" size={12} filled /><span className="num">{fmt(c.likes)}</span></span>
        </Link>
      ))}
    </div>
  );
}
