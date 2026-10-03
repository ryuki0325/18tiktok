import Link from "next/link";
import type { PersonRow } from "@/lib/profile";
import { Icon } from "../Icon";
import { ProfileAvatar } from "./ProfileAvatar";
import { FollowButton } from "./FollowButton";

/** 人の一覧（フォロー中・フォロワー・おすすめ） */
export function PeopleList({ people, meId, loggedIn, empty }: { people: PersonRow[]; meId: string | null; loggedIn: boolean; empty: React.ReactNode }) {
  if (!people.length) return <>{empty}</>;
  return (
    <div className="people">
      {people.map((x) => (
        <div key={x.id} className="person">
          <Link href={`/u/${encodeURIComponent(x.handle)}`} aria-label={`@${x.handle} のページ`}><ProfileAvatar hue={x.avatarHue} url={x.avatarUrl} size={46} /></Link>
          <Link className="b" href={`/u/${encodeURIComponent(x.handle)}`}>
            <b>@{x.handle}</b>
            {(x.displayName && x.displayName !== x.handle) || x.bio ? <span className="cap">{x.bio || x.displayName}</span> : null}
          </Link>
          {x.id !== meId && <FollowButton creatorId={x.id} initial={x.followed} loggedIn={loggedIn} handle={x.handle} small />}
        </div>
      ))}
    </div>
  );
}

export function PeopleEmpty({ title, hint }: { title: string; hint?: string }) {
  return <div className="prof-empty"><Icon name="userplus" size={38} /><b>{title}</b>{hint && <span className="cap">{hint}</span>}</div>;
}
