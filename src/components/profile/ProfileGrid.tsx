import Link from "next/link";
import type { VideoCard } from "@/lib/content";
import { Icon } from "../Icon";
import { Thumb } from "../VideoBackdrop";
import { fmt } from "../format";

const STATUS: Record<string, [string, string]> = {
  pending_review: ["審査中", "b-warn"],
  rejected: ["差し戻し", "b-bad"],
  hidden_by_creator: ["非公開", ""],
  hidden_by_report: ["通報により非公開", "b-bad"],
};

/** 動画のサムネイル一覧。TikTok と同じく左下に再生数を出す */
export function ProfileGrid({ cards, empty, showStatus = false, hrefFor }: { cards: VideoCard[]; empty: React.ReactNode; showStatus?: boolean; hrefFor?: (c: VideoCard) => string }) {
  if (!cards.length) return <>{empty}</>;
  return (
    <div className="thumbs">
      {cards.map((c) => {
        const st = showStatus ? STATUS[c.status] : undefined;
        return (
          <Link key={c.id} className="thumb" href={hrefFor ? hrefFor(c) : `/?v=${c.id}`} aria-label={c.title}>
            <Thumb card={c} />
            <span className="meta">
              {c.kind === "photo"
                ? <><Icon name="images" size={12} />{c.images && c.images.length > 1 && <span className="num">{c.images.length}</span>}</>
                : <><Icon name="play" size={12} filled /><span className="num">{fmt(c.views)}</span></>}
            </span>
            {c.pinned && <span className="badge" style={{ position: "absolute", right: 5, top: 5, background: "rgba(0,0,0,.6)", color: "#fff" }}>固定</span>}
            {st && <span className={`badge ${st[1]}`} style={{ position: "absolute", left: 5, top: 5 }}>{st[0]}</span>}
          </Link>
        );
      })}
    </div>
  );
}

/** 何もないときの表示（タブごとに文言を変える） */
export function EmptyGrid({ icon, title, hint, action }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="prof-empty">
      <Icon name={icon} size={38} />
      <b>{title}</b>
      {hint && <span className="cap">{hint}</span>}
      {action}
    </div>
  );
}
