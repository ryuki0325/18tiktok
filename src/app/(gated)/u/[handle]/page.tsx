import { and, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { creatorProfiles, follows, users } from "@/db/schema";
import { videosByCreator } from "@/lib/content";
import { viewerContext } from "@/lib/viewer";
import { NavBar } from "@/components/NavBar";
import { Avatar } from "@/components/VideoBackdrop";
import { VideoGrid } from "@/components/VideoGrid";
import { TabBar } from "@/components/TabBar";
import { fmt } from "@/components/format";
import { FollowButton } from "./FollowButton";

export default async function CreatorPage({ params }: { params: Promise<{ handle: string }> }) {
  const ctx = await viewerContext();
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  const conn = await db();
  const [c] = await conn.select({ u: users, p: creatorProfiles }).from(users).innerJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(and(eq(users.handle, handle), eq(creatorProfiles.status, "approved")));
  if (!c) notFound();
  const [cards, [{ n }], following] = await Promise.all([
    videosByCreator(c.u.id, ctx),
    conn.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.creatorId, c.u.id)),
    ctx.userId ? conn.select().from(follows).where(and(eq(follows.followerId, ctx.userId), eq(follows.creatorId, c.u.id))) : Promise.resolve([]),
  ]);
  const likes = cards.reduce((s, v) => s + v.likes, 0);
  return (
    <div className="screen with-nav">
      <NavBar title={`@${c.u.handle}`} back="/" />
      <div className="sec" style={{ gap: 16, paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Avatar hue={c.u.avatarHue} size={72} />
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3,1fr)", textAlign: "center" }}>
            {[["投稿", cards.length], ["フォロワー", n], ["いいね", likes]].map(([k, v]) => <div key={k}><div className="num" style={{ fontWeight: 700, fontSize: 18 }}>{fmt(Number(v))}</div><div className="cap">{k}</div></div>)}
          </div>
        </div>
        {c.p.bio && <p style={{ margin: 0, fontSize: 14 }}>{c.p.bio}</p>}
        {ctx.userId !== c.u.id && <FollowButton creatorId={c.u.id} initial={following.length > 0} loggedIn={!!ctx.user} />}
      </div>
      <div style={{ padding: "0 3px" }}><VideoGrid cards={cards} /></div>
      <TabBar />
    </div>
  );
}
