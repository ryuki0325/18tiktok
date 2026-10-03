import Link from "next/link";
import { notFound } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { peopleOf, profileOf } from "@/lib/profile";
import { NavBar } from "@/components/NavBar";
import { NavTabs } from "@/components/NavTabs";
import { PeopleEmpty, PeopleList } from "@/components/profile/PeopleList";

export const metadata = { title: "フォロー" };

export default async function People({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ tab?: string }> }) {
  const ctx = await viewerContext();
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  const kind = (await searchParams).tab === "following" ? "following" : "followers";
  const p = await profileOf({ handle }, ctx.userId);
  if (!p) notFound();
  const people = await peopleOf(p.id, kind, ctx.userId);
  const base = `/u/${encodeURIComponent(p.handle)}/people`;
  return (
    <div className="screen with-nav">
      <NavBar title={`@${p.handle}`} back={`/u/${encodeURIComponent(p.handle)}`} />
      <div className="seg" style={{ margin: "4px 16px 10px" }} role="tablist">
        <Link role="tab" aria-selected={kind === "followers"} href={base}>フォロワー <span className="num">{p.followers}</span></Link>
        <Link role="tab" aria-selected={kind === "following"} href={`${base}?tab=following`}>フォロー中 <span className="num">{p.following}</span></Link>
      </div>
      <PeopleList people={people} meId={ctx.userId} loggedIn={!!ctx.user} empty={
        <PeopleEmpty title={kind === "followers" ? "フォロワーはまだいません" : "まだ誰もフォローしていません"} />} />
      <NavTabs />
    </div>
  );
}
