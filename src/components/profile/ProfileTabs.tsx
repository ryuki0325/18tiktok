import Link from "next/link";
import type { ProfileTab } from "@/lib/profile";
import { Icon, type IconName } from "../Icon";

/** プロフィールのタブ（TikTokと同じく、アイコンだけの横並び＋下線） */
export function ProfileTabs({ tabs, current, href }: { tabs: [ProfileTab, IconName, string][]; current: ProfileTab; href: (t: ProfileTab) => string }) {
  return (
    <nav className="prof-tabs" role="tablist" aria-label="プロフィールの表示">
      {tabs.map(([t, icon, label]) => (
        <Link key={t} role="tab" aria-selected={t === current} href={href(t)} aria-label={label} scroll={false}>
          <Icon name={icon} size={21} filled={t === current && icon !== "grid"} />
        </Link>
      ))}
    </nav>
  );
}
