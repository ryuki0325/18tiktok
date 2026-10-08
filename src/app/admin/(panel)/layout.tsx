import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "@/lib/account-actions";
import { AdminNav } from "./AdminNav";

export const metadata = { title: { default: "管理画面", template: "%s | VYBE 管理" } };

const ROLE: Record<string, string> = { super_admin: "スーパー管理者", reviewer: "審査担当", report_handler: "通報対応担当" };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  const conn = await db();
  // ナビのバッジ用の件数は、1回の問い合わせでまとめて取る（往復・接続数を減らす）
  const [badge] = await conn.select({
    cases: sql<number>`(select count(*) from moderation_cases where status in ('open','in_progress'))::int`,
    creators: sql<number>`(select count(*) from creator_profiles where status = 'pending')::int`,
    links: sql<number>`(select count(*) from destinations where status = 'pending')::int`,
    takedowns: sql<number>`(select count(*) from takedown_requests where status in ('received','investigating'))::int`,
    cmts: sql<number>`(select count(*) from comments where status in ('pending','hidden_by_report'))::int`,
    pendingLinks: sql<number>`(select count(*) from outbound_links where status = 'pending_domain_review')::int`,
    newTags: sql<number>`(select count(*) from tags where status = 'pending')::int`,
  }).from(sql`(select 1) as _one`);
  const { cases, creators, links, takedowns, cmts, pendingLinks, newTags } = badge;
  return (
    <div className="admin">
      <aside>
        <div style={{ padding: "0 12px 14px" }}><div className="brand" style={{ fontSize: 30, padding: 0 }}>VYBE</div><span className="cap">{ROLE[a.role]}・@{a.handle}</span></div>
        <AdminNav counts={{ cases, creators, links: links + pendingLinks, takedowns, comments: cmts, tags: newTags }} />
        <form action={logoutAction} style={{ marginTop: "auto" }}><button className="btn btn-sm btn-secondary" style={{ width: "100%" }}>ログアウト</button></form>
      </aside>
      <main>{children}</main>
    </div>
  );
}
