import Link from "next/link";
import type { Profile } from "@/lib/profile";
import { Icon } from "../Icon";
import { fmt } from "../format";
import { ProfileAvatar } from "./ProfileAvatar";
import { FollowButton } from "./FollowButton";

/**
 * プロフィールの上半分（TikTokと同じ並び）。
 * アイコン → @ユーザー名 → フォロー中／フォロワー／いいね → ボタン → 自己紹介
 */
export function ProfileHeader({ p, mine, loggedIn }: { p: Profile; mine: boolean; loggedIn: boolean }) {
  const stats: [string, number, string | null][] = [
    ["フォロー中", p.following, `/u/${encodeURIComponent(p.handle)}/people?tab=following`],
    ["フォロワー", p.followers, `/u/${encodeURIComponent(p.handle)}/people?tab=followers`],
    ["いいね", p.likes, null],
  ];
  return (
    <header className="prof">
      <ProfileAvatar hue={p.avatarHue} url={p.avatarUrl} size={96} />
      <b className="prof-h">@{p.handle}</b>
      {p.displayName && p.displayName !== p.handle && <span className="cap">{p.displayName}</span>}
      <div className="prof-stats">
        {stats.map(([k, v, href]) => {
          const inner = <><span className="v num">{fmt(v)}</span><span className="k">{k}</span></>;
          return href ? <Link key={k} href={href}>{inner}</Link> : <span key={k}>{inner}</span>;
        })}
      </div>
      <div className="prof-act">
        {mine ? (
          <>
            <Link className="btn btn-secondary" href="/me/edit">プロフィールを編集</Link>
            <Link className="btn btn-secondary" href="/me/people?tab=suggested" aria-label="友達を追加"><Icon name="userplus" size={20} /></Link>
          </>
        ) : (
          <>
            <FollowButton creatorId={p.id} initial={p.followed} followsYou={p.followsYou} loggedIn={loggedIn} handle={p.handle} />
            <Link className="btn btn-secondary" href={`/u/${encodeURIComponent(p.handle)}/people?tab=followers`} aria-label="フォロワーを見る"><Icon name="userplus" size={20} /></Link>
          </>
        )}
      </div>
      {p.bio && <p className="prof-bio">{p.bio}</p>}
    </header>
  );
}
