import Link from "next/link";
import { redirect } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { peopleOf, profileOf, suggestedCreators } from "@/lib/profile";
import { NavBar } from "@/components/NavBar";
import { NavTabs } from "@/components/NavTabs";
import { PeopleEmpty, PeopleList } from "@/components/profile/PeopleList";

export const metadata = { title: "フォロー" };

const TABS = [["followers", "フォロワー"], ["following", "フォロー中"], ["suggested", "おすすめ"]] as const;

export default async function MyPeople({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await viewerContext();
  if (!ctx.user) redirect("/login?next=/me/people");
  const t = (await searchParams).tab;
  const tab = TABS.some(([k]) => k === t) ? (t as "followers" | "following" | "suggested") : "followers";
  const p = (await profileOf({ id: ctx.user.id }, ctx.user.id))!;
  const people = tab === "suggested" ? await suggestedCreators(ctx.user.id, 20) : await peopleOf(ctx.user.id, tab, ctx.user.id);
  const n: Record<string, number> = { followers: p.followers, following: p.following };
  return (
    <div className="screen with-nav">
      <NavBar title={`@${p.handle}`} back="/me" />
      <div className="seg" style={{ margin: "4px 16px 10px" }} role="tablist">
        {TABS.map(([k, l]) => (
          <Link key={k} role="tab" aria-selected={tab === k} href={k === "followers" ? "/me/people" : `/me/people?tab=${k}`}>
            {l}{n[k] !== undefined && <> <span className="num">{n[k]}</span></>}
          </Link>
        ))}
      </div>
      <PeopleList people={people} meId={ctx.user.id} loggedIn empty={
        <PeopleEmpty
          title={tab === "followers" ? "フォロワーはまだいません" : tab === "following" ? "まだ誰もフォローしていません" : "おすすめできる投稿者がいません"}
          hint={tab === "following" ? "気になる投稿者のアイコンの＋を押すと、ここに並びます。" : undefined} />} />
      <NavTabs />
    </div>
  );
}
