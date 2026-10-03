import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { NavTabs } from "@/components/NavTabs";
import { Icon, type IconName } from "@/components/Icon";
import { ago } from "@/components/format";

export const metadata = { title: "お知らせ" };

/** 種類ごとのアイコンと色（TikTokの受信箱と同じく、ひと目で分かるように） */
const KIND: Record<string, [IconName, string]> = {
  video_approved: ["check", "var(--ok)"],
  video_rejected: ["alert", "var(--bad)"],
  penalty: ["alert", "var(--bad)"],
  follow: ["userplus", "var(--accent)"],
  comment: ["msg", "var(--accent)"],
  like: ["heart", "var(--bad)"],
};
const look = (kind: string): [IconName, string] =>
  KIND[kind] ?? (/reject|penalt|removed|hidden/.test(kind) ? ["alert", "var(--bad)"] : /approve|published/.test(kind) ? ["check", "var(--ok)"] : ["bell", "var(--accent)"]);

export default async function Notifications() {
  const u = await requireUser("/notifications");
  const conn = await db();
  const rows = await conn.select().from(notifications).where(eq(notifications.userId, u.id)).orderBy(desc(notifications.createdAt)).limit(100);
  // 開いた時点で既読にする（バッジを消す）
  await conn.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, u.id), isNull(notifications.readAt)));
  return (
    <div className="screen with-nav">
      <NavBar title="お知らせ" back="/me" />
      {rows.length === 0 ? (
        <div className="prof-empty" style={{ padding: "72px 24px" }}>
          <Icon name="bell" size={38} />
          <b>お知らせはまだありません</b>
          <span className="cap">動画が公開されたときや、運営からの連絡がここに届きます。</span>
          <Link className="btn btn-primary pill" style={{ width: "auto", padding: "0 22px" }} href="/">動画を見る</Link>
        </div>
      ) : (
        <div className="notifs">
          {rows.map((n) => {
            const [icon, color] = look(n.kind);
            return (
              <div key={n.id} className={`notif${n.readAt ? "" : " unread"}`}>
                <span className="ic" style={{ color }}><Icon name={icon} size={20} /></span>
                <span className="b">{n.body}<span className="cap">{ago(n.createdAt)}</span></span>
                {!n.readAt && <span className="pip" aria-label="未読" />}
              </div>
            );
          })}
        </div>
      )}
      <NavTabs />
    </div>
  );
}
