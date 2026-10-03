import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { viewerContext } from "@/lib/viewer";
import { profileOf, profileVideos, type ProfileTab } from "@/lib/profile";
import { Icon, type IconName } from "@/components/Icon";
import { NavTabs } from "@/components/NavTabs";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfilePage } from "@/components/profile/ProfilePage";
import { MeMenu } from "./MeMenu";
import { ResendVerify } from "./ResendVerify";

export const metadata = { title: "マイページ" };

const TABS: [ProfileTab, IconName, string][] = [
  ["posts", "grid", "投稿"], ["private", "lock", "非公開"], ["saved", "bookmark", "保存した動画"], ["liked", "heart", "いいねした動画"],
];

export default async function Me({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await viewerContext();
  const t = (await searchParams).tab;
  const u = ctx.user;
  if (!u) return <Guest tab={t} ctx={ctx} />;

  const tab: ProfileTab = TABS.some(([k]) => k === t) ? (t as ProfileTab) : "posts";
  const p = (await profileOf({ id: u.id }, u.id))!;
  const [cards, [{ unread }]] = await Promise.all([
    profileVideos(tab, p, ctx),
    (await db()).select({ unread: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, u.id), isNull(notifications.readAt))),
  ]);
  const tabs = p.isCreator ? TABS : TABS.filter(([k]) => k !== "private");
  return (
    <ProfilePage
      p={p} mine loggedIn tab={tab} cards={cards} tabs={tabs} href={(x) => (x === "posts" ? "/me" : `/me?tab=${x}`)}
      top={
        <div className="navbar">
          <Link className="iconbtn" href="/notifications" aria-label={unread > 0 ? `お知らせ（未読${unread}件）` : "お知らせ"} style={{ position: "relative" }}>
            <Icon name="bell" />{unread > 0 && <span className="dot-n num">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <h1 style={{ fontSize: 17 }}>@{u.handle}</h1>
          <MeMenu isCreator={p.isCreator} isAdmin={u.role !== "user"} />
        </div>
      }
    >
      {!u.emailVerifiedAt && <div className="sec" style={{ paddingTop: 0, paddingBottom: 12 }}><ResendVerify /></div>}
    </ProfilePage>
  );
}

/** ログインしていない人のマイページ。端末に保存した「保存・いいね」は見られる */
async function Guest({ tab, ctx }: { tab?: string; ctx: Awaited<ReturnType<typeof viewerContext>> }) {
  const current: ProfileTab = tab === "liked" ? "liked" : "saved";
  const cards = await profileVideos(current, { id: "", handle: "", displayName: "", avatarHue: 280, avatarUrl: null, bio: "", isCreator: false, createdAt: "", posts: 0, followers: 0, following: 0, likes: 0, followed: false, followsYou: false }, ctx);
  return (
    <div className="screen with-nav">
      <div className="navbar"><span className="sp44" /><h1 style={{ fontSize: 17 }}>マイページ</h1><Link className="iconbtn" href="/settings" aria-label="設定"><Icon name="sliders" /></Link></div>
      <header className="prof">
        <ProfileAvatar hue={280} size={96} />
        <b className="prof-h">ログインしていません</b>
        <p className="prof-bio">見るだけならアカウントは不要です。フォロー・コメント・投稿にはログインが必要です。</p>
        <div className="prof-act">
          <Link className="btn btn-primary" href="/login?next=/me">ログイン</Link>
          <Link className="btn btn-secondary" href="/signup">新規登録</Link>
        </div>
      </header>
      <nav className="prof-tabs" role="tablist" aria-label="プロフィールの表示">
        {([["saved", "bookmark", "保存した動画"], ["liked", "heart", "いいねした動画"]] as const).map(([k, i, l]) => (
          <Link key={k} role="tab" aria-selected={current === k} href={k === "saved" ? "/me" : "/me?tab=liked"} aria-label={l} scroll={false}><Icon name={i} size={21} filled={current === k} /></Link>
        ))}
      </nav>
      <div className="prof-body">
        {cards.length === 0
          ? <div className="prof-empty"><Icon name={current === "saved" ? "bookmark" : "heart"} size={38} /><b>{current === "saved" ? "保存した動画はまだありません" : "いいねした動画はまだありません"}</b><span className="cap">この端末に保存されます。ログインすると、ほかの端末でも見られます。</span></div>
          : <GuestGrid cards={cards} />}
      </div>
      <NavTabs />
    </div>
  );
}

async function GuestGrid({ cards }: { cards: Awaited<ReturnType<typeof profileVideos>> }) {
  const { ProfileGrid } = await import("@/components/profile/ProfileGrid");
  return <ProfileGrid cards={cards} empty={null} />;
}
