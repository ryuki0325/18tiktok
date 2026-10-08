import { notFound } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { profileOf, profileVideos, type ProfileTab } from "@/lib/profile";
import type { IconName } from "@/components/Icon";
import { ProfileBar, ProfilePage } from "@/components/profile/ProfilePage";
import { UserMenu } from "./UserMenu";

const POSTS: [ProfileTab, IconName, string] = ["posts", "grid", "投稿"];
const LIKED: [ProfileTab, IconName, string] = ["liked", "heart", "いいねした動画"];

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  return { title: `@${decodeURIComponent((await params).handle)}` };
}

export default async function CreatorPage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string }> }) {
  const ctx = await viewerContext();
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  const p = await profileOf({ handle }, ctx.userId);
  if (!p || !p.isCreator) notFound();
  // 自分のページを開いたらマイページと同じ見た目にする
  const mine = ctx.userId === p.id;
  // いいね一覧は、その人が「見せる」設定にしているときだけタブに出す
  const tabs = p.publicLikes ? [POSTS, LIKED] : [POSTS];
  const t = (await searchParams).tab;
  const tab: ProfileTab = t === "liked" && p.publicLikes ? "liked" : "posts";
  const cards = await profileVideos(tab, p, ctx);
  const base = `/u/${encodeURIComponent(p.handle)}`;
  return (
    <ProfilePage
      p={p} mine={mine} loggedIn={!!ctx.user} tab={tab} cards={cards} tabs={tabs} href={(x) => (x === "posts" ? base : `${base}?tab=${x}`)}
      top={<ProfileBar handle={p.handle} back="/" right={<UserMenu creatorId={p.id} handle={p.handle} mine={mine} />} />}
    />
  );
}
