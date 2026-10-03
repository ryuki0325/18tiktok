"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

/** 下のバー。TikTok と同じ並び：ホーム・探す・＋・お知らせ・マイページ */
const ITEMS: [string, IconName, string][] = [
  ["/", "house", "ホーム"], ["/explore", "compass", "探す"], ["/creator/new", "plus", "投稿"], ["/notifications", "bell", "お知らせ"], ["/me", "user", "マイページ"],
];

export function TabBar({ onVideo = false, unread = 0 }: { onVideo?: boolean; unread?: number }) {
  const path = usePathname();
  return (
    <nav className={`tabbar${onVideo ? " on-video" : ""}`} aria-label="メイン">
      {ITEMS.map(([href, icon, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        if (href === "/creator/new")
          return <Link key={href} href={href} aria-label="投稿する"><span className="plus"><Icon name="plus" size={22} stroke={2.2} /></span></Link>;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <span style={{ position: "relative" }}>
              <Icon name={icon} filled={active && icon !== "compass"} />
              {href === "/notifications" && unread > 0 && <span className="dot-n num">{unread > 99 ? "99+" : unread}</span>}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
