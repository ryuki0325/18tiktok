import { notFound } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { profileOf, profileVideos, type ProfileTab } from "@/lib/profile";
import type { IconName } from "@/components/Icon";
import { ProfileBar, ProfilePage } from "@/components/profile/ProfilePage";
import { UserMenu } from "./UserMenu";

const TABS: [ProfileTab, IconName, string][] = [["posts", "grid", "投稿"]];

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  return { title: `@${decodeURIComponent((await params).handle)}` };
}

export default async function CreatorPage({ params }: { params: Promise<{ handle: string }> }) {
  const ctx = await viewerContext();
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  const p = await profileOf({ handle }, ctx.userId);
  if (!p || !p.isCreator) notFound();
  // 自分のページを開いたらマイページと同じ見た目にする
  const mine = ctx.userId === p.id;
  const cards = await profileVideos("posts", p, ctx);
  return (
    <ProfilePage
      p={p} mine={mine} loggedIn={!!ctx.user} tab="posts" cards={cards} tabs={TABS} href={() => `/u/${encodeURIComponent(p.handle)}`}
      top={<ProfileBar handle={p.handle} back="/" right={<UserMenu creatorId={p.id} handle={p.handle} mine={mine} />} />}
    />
  );
}
