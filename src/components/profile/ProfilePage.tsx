import Link from "next/link";
import type { Profile, ProfileTab } from "@/lib/profile";
import type { VideoCard } from "@/lib/content";
import { Icon, type IconName } from "../Icon";
import { NavTabs } from "../NavTabs";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileTabs } from "./ProfileTabs";
import { EmptyGrid, ProfileGrid } from "./ProfileGrid";

/** 自分のページも他人のページも、この1つの見た目にそろえる（TikTokと同じ） */
export function ProfilePage({ p, mine, loggedIn, tab, cards, tabs, href, top, children }: {
  p: Profile; mine: boolean; loggedIn: boolean; tab: ProfileTab; cards: VideoCard[];
  tabs: [ProfileTab, IconName, string][]; href: (t: ProfileTab) => string;
  top: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="screen with-nav">
      {top}
      <ProfileHeader p={p} mine={mine} loggedIn={loggedIn} />
      {children}
      <ProfileTabs tabs={tabs} current={tab} href={href} />
      <div className="prof-body">
        <ProfileGrid cards={cards} showStatus={tab === "private"} empty={<Empty tab={tab} mine={mine} isCreator={p.isCreator} />} />
      </div>
      <NavTabs />
    </div>
  );
}

function Empty({ tab, mine, isCreator }: { tab: ProfileTab; mine: boolean; isCreator: boolean }) {
  if (tab === "liked") return <EmptyGrid icon="heart" title="いいねした動画はまだありません" hint={mine ? "動画をダブルタップするか、ハートを押すとここに並びます。" : undefined} />;
  if (tab === "saved") return <EmptyGrid icon="bookmark" title="保存した動画はまだありません" hint="フィードの「保存」を押すと、あとから見返せます。" />;
  if (tab === "private") return <EmptyGrid icon="lock" title="非公開の動画はありません" hint="審査中・差し戻し・自分で非公開にした動画がここに並びます。" />;
  if (mine && !isCreator) {
    return <EmptyGrid icon="video" title="動画を投稿してみませんか" hint="投稿者になると、ここに自分の動画が並びます。"
      action={<Link className="btn btn-primary pill" style={{ width: "auto", padding: "0 22px" }} href="/creator/apply">投稿者になる</Link>} />;
  }
  if (mine) {
    return <EmptyGrid icon="video" title="まだ投稿がありません" hint="最初の動画を投稿しましょう。"
      action={<Link className="btn btn-primary pill" style={{ width: "auto", padding: "0 22px" }} href="/creator/new">動画を投稿する</Link>} />;
  }
  return <EmptyGrid icon="video" title="まだ投稿がありません" />;
}

/** プロフィール上部のバー（中央に@ユーザー名） */
export function ProfileBar({ handle, back, right }: { handle: string; back?: string; right?: React.ReactNode }) {
  return (
    <div className="navbar">
      {back ? <Link className="iconbtn" href={back} aria-label="戻る"><Icon name="back" /></Link> : <span className="sp44" />}
      <h1 style={{ fontSize: 17 }}>@{handle}</h1>
      {right ?? <span className="sp44" />}
    </div>
  );
}
