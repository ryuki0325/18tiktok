import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, creatorProfiles, destinations, moderationCases, outboundLinks, tags, takedownRequests, videos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "@/lib/account-actions";
import { AdminNav } from "./AdminNav";

export const metadata = { title: { default: "管理画面", template: "%s | VYBE 管理" } };

const ROLE: Record<string, string> = { super_admin: "スーパー管理者", reviewer: "審査担当", report_handler: "通報対応担当" };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const conn = await db();
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
  const c = sql<number>`count(*)::int`;
  const [reviews, cases, creators, links, takedowns, cmts, pendingLinks, newTags] = await Promise.all([
    n(conn.select({ n: c }).from(videos).where(eq(videos.status, "pending_review"))),
    n(conn.select({ n: c }).from(moderationCases).where(sql`${moderationCases.status} in ('open','in_progress')`)),
    n(conn.select({ n: c }).from(creatorProfiles).where(eq(creatorProfiles.status, "pending"))),
    n(conn.select({ n: c }).from(destinations).where(eq(destinations.status, "pending"))),
    n(conn.select({ n: c }).from(takedownRequests).where(sql`${takedownRequests.status} in ('received','investigating')`)),
    n(conn.select({ n: c }).from(comments).where(and(sql`${comments.status} in ('pending','hidden_by_report')`))),
    n(conn.select({ n: c }).from(outboundLinks).where(eq(outboundLinks.status, "pending_domain_review"))),
    n(conn.select({ n: c }).from(tags).where(eq(tags.status, "pending"))),
  ]);
  return (
    <div className="admin">
      <aside>
        <div style={{ padding: "0 12px 14px" }}><div className="brand" style={{ fontSize: 30, padding: 0 }}>VYBE</div><span className="cap">{ROLE[a.role]}・@{a.handle}</span></div>
        <AdminNav counts={{ reviews, cases, creators, links: links + pendingLinks, takedowns, comments: cmts, tags: newTags }} />
        <form action={logoutAction} style={{ marginTop: "auto" }}><button className="btn btn-sm btn-secondary" style={{ width: "100%" }}>ログアウト</button></form>
      </aside>
      <main>{children}</main>
    </div>
  );
}
