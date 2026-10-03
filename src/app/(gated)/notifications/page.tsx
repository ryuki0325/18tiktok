import { desc, eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Icon } from "@/components/Icon";
import { ago } from "@/components/format";

export const metadata = { title: "お知らせ" };

export default async function Notifications() {
  const u = await requireUser("/notifications");
  const conn = await db();
  const rows = await conn.select().from(notifications).where(eq(notifications.userId, u.id)).orderBy(desc(notifications.createdAt)).limit(100);
  await conn.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, u.id), isNull(notifications.readAt)));
  return (
    <div className="screen">
      <NavBar title="お知らせ" back="/me" />
      <div className="sec">
        {rows.length === 0 ? <p className="cap" style={{ textAlign: "center", padding: 40 }}>お知らせはまだありません。</p> : (
          <div className="list">
            {rows.map((n) => (
              <div key={n.id} className="row" style={{ alignItems: "flex-start", padding: "14px 16px" }}>
                <span style={{ color: n.kind.includes("reject") || n.kind.includes("penalty") || n.kind.includes("removed") ? "var(--bad)" : "var(--accent)" }}><Icon name={n.kind.includes("penalty") ? "alert" : "bell"} size={20} /></span>
                <span className="grow" style={{ fontSize: 14 }}>{n.body}<span className="cap" style={{ display: "block", marginTop: 4 }}>{ago(n.createdAt)}{!n.readAt && "・未読"}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
