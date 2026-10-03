"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

const ITEMS: [string, IconName, string][] = [
  ["/", "house", "ホーム"], ["/explore", "compass", "探す"], ["/creator/new", "plus", "投稿"], ["/favorites", "bookmark", "お気に入り"], ["/me", "user", "マイページ"],
];

export function TabBar({ onVideo = false }: { onVideo?: boolean }) {
  const path = usePathname();
  return (
    <nav className={`tabbar${onVideo ? " on-video" : ""}`} aria-label="メイン">
      {ITEMS.map(([href, icon, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        if (href === "/creator/new")
          return <Link key={href} href={href} aria-label="投稿する"><span className="plus"><Icon name="plus" size={22} stroke={2.2} /></span></Link>;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <Icon name={icon} filled={active && icon !== "compass"} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
