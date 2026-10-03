import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { follows, notifications, videos } from "@/db/schema";
import { viewerContext } from "@/lib/viewer";
import { getThemePref } from "@/lib/theme-server";
import { themeName } from "@/lib/theme";
import { logoutAction } from "@/lib/account-actions";
import { Icon, type IconName } from "@/components/Icon";
import { NavBar } from "@/components/NavBar";
import { Avatar } from "@/components/VideoBackdrop";
import { TabBar } from "@/components/TabBar";
import { fmt } from "@/components/format";
import { ResendVerify } from "./ResendVerify";
import { InstallPrompt } from "@/components/InstallPrompt";

export const metadata = { title: "マイページ" };

const CREATOR_LABEL: Record<string, string> = { pending: "投稿者申請：審査中", approved: "投稿者", rejected: "投稿者申請：却下", suspended: "投稿者：一時停止中", banned: "投稿者：停止" };

export default async function Me() {
  const ctx = await viewerContext();
  const pref = await getThemePref();
  const u = ctx.user;
  const settingsLink = <Link className="iconbtn" href="/settings" aria-label="設定"><Icon name="sliders" /></Link>;
  if (!u) {
    return (
      <div className="screen with-nav">
        <NavBar title="マイページ" right={settingsLink} />
        <div className="sec" style={{ gap: 16, paddingTop: 8 }}>
          <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
            <Avatar hue={280} size={64} />
            <b style={{ fontSize: 17 }}>ログインしていません</b>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>見るだけならアカウントは不要です。フォロー・コメント・投稿にはログインが必要です。</p>
            <div style={{ display: "flex", gap: 10, width: "100%" }}><Link className="btn btn-primary" href="/login">ログイン</Link><Link className="btn btn-secondary" href="/signup">新規登録</Link></div>
          </div>
          <ThemeCard name={themeName(pref.id)} mode={pref.mode} />
        </div>
        <TabBar />
      </div>
    );
  }
  const conn = await db();
  const [[{ following }], [{ posts }], [{ unread }]] = await Promise.all([
    conn.select({ following: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followerId, u.id)),
    conn.select({ posts: sql<number>`count(*)::int` }).from(videos).where(and(eq(videos.creatorId, u.id), eq(videos.status, "published"))),
    conn.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, u.id), isNull(notifications.readAt))),
  ]);
  const [{ followers }] = await conn.select({ followers: sql<number>`count(*)::int` }).from(follows).where(eq(follows.creatorId, u.id));
  const rows: [string, IconName, string, React.ReactNode?][] = u.creatorStatus === "approved"
    ? [["/creator/dashboard", "chart", "投稿者ダッシュボード"], ["/creator/new", "video", "動画を投稿する"], ["/creator/videos", "file", "自分の投稿"]]
    : [["/creator/apply", "video", u.creatorStatus ? "投稿者申請の状況" : "投稿者になる"]];
  rows.push(["/notifications", "bell", "お知らせ", unread > 0 ? <span className="badge b-bad num">{unread}</span> : undefined], ["/favorites", "bookmark", "お気に入り"], ["/settings", "sliders", "設定"]);
  return (
    <div className="screen with-nav">
      <NavBar title="マイページ" right={settingsLink} />
      <div className="sec" style={{ gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar hue={u.avatarHue} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>@{u.handle}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              {u.creatorStatus && <span className="rank">{CREATOR_LABEL[u.creatorStatus]}</span>}
              {u.role !== "user" && <Link className="rank" href="/admin" style={{ color: "var(--accent)" }}>運営</Link>}
            </div>
          </div>
        </div>
        {!u.emailVerifiedAt && <ResendVerify />}
        <div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          {[["フォロー", following], ["フォロワー", followers], ["投稿", posts]].map(([k, v]) => <div key={k} className="stat" style={{ padding: 12, textAlign: "center" }}><div className="v" style={{ fontSize: 20, margin: 0 }}>{fmt(Number(v))}</div><div className="k">{k}</div></div>)}
        </div>
        <div className="list">
          {rows.map(([href, icon, label, extra]) => (
            <Link key={href} className="row" href={href}><span style={{ color: "var(--accent)" }}><Icon name={icon} size={22} /></span><span className="grow">{label}</span>{extra}<span className="muted"><Icon name="chev" size={20} /></span></Link>
          ))}
        </div>
        <ThemeCard name={themeName(pref.id)} mode={pref.mode} />
        <InstallPrompt />
        <form action={logoutAction}><button className="btn btn-secondary" style={{ color: "var(--bad)" }}><Icon name="logout" size={20} />ログアウト</button></form>
      </div>
      <TabBar />
    </div>
  );
}

function ThemeCard({ name, mode }: { name: string; mode: string }) {
  return (
    <Link className="feature-card" href="/settings/theme">
      <span className="ic"><Icon name="palette" /></span>
      <span style={{ flex: 1 }}><b style={{ display: "block" }}>アプリの見た目を自分好みに</b><span className="cap">現在：{name}・{({ dark: "ダーク", light: "ライト", system: "システム" } as Record<string, string>)[mode]}</span></span>
      <span className="muted"><Icon name="chev" size={20} /></span>
    </Link>
  );
}
