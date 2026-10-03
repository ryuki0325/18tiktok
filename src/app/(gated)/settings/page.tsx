import Link from "next/link";
import { getThemePref } from "@/lib/theme-server";
import { tokensFor, themeName } from "@/lib/theme";
import { currentUser } from "@/lib/auth";
import { logoutAction } from "@/lib/account-actions";
import { Icon, type IconName } from "@/components/Icon";
import { NavBar } from "@/components/NavBar";
import { InstallPrompt } from "@/components/InstallPrompt";

export const metadata = { title: "設定" };

export default async function Settings() {
  const pref = await getThemePref();
  const u = await currentUser();
  const t = tokensFor(pref.id, pref.mode === "light" ? "light" : "dark", pref.custom);
  const items: [IconName, string, string][] = [
    ["sliders", "好み・絞り込み（ジャンル・刺激の強さ）", "/welcome/tags"], ["user", "アカウント・パスワード・退会", u ? "/settings/account" : "/login"], ["eyeoff", "表示しない投稿者", "/settings/blocks"], ["bell", "通知", "/notifications"], ["shield", "年齢確認", "/legal/terms#age"],
    ["eye", "プライバシー", "/legal/privacy"], ["flag", "削除・権利侵害の申告", "/takedown"],
    ["file", "利用規約", "/legal/terms"], ["file", "プライバシーポリシー", "/legal/privacy"], ["file", "投稿ガイドライン", "/legal/guidelines"], ["file", "運営者情報", "/legal/operator"],
  ];
  return (
    <div className="screen">
      <NavBar title="設定" back="/me" />
      <div className="sec" style={{ gap: 16, paddingBottom: 24 }}>
        <InstallPrompt />
        <Link className="feature-card" href="/settings/theme">
          <span className="ic"><Icon name="palette" /></span>
          <span style={{ flex: 1 }}>
            <b style={{ display: "block", fontSize: 16 }}>デザイン・テーマ</b>
            <span className="cap">現在：{themeName(pref.id)}。色と表示モードを自由に変更</span>
            <span className="mini-dots">{[t.bg, t.surface, t.accent, t.accent2, t.text].map((c, i) => <i key={i} style={{ background: c }} />)}</span>
          </span>
          <span className="muted"><Icon name="chev" size={20} /></span>
        </Link>
        <div className="list">{items.map(([i, l, h]) => <Link key={l} className="row" href={h}><span className="muted"><Icon name={i} size={22} /></span><span className="grow">{l}</span><span className="muted"><Icon name="chev" size={20} /></span></Link>)}</div>
        {u && <form action={logoutAction} className="list"><button className="row" style={{ color: "var(--bad)" }}><Icon name="logout" size={22} /><span className="grow">ログアウト</span></button></form>}
        <p className="cap" style={{ textAlign: "center", margin: 0 }}>Glow 0.2.0</p>
      </div>
    </div>
  );
}
