"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/Icon";
import { logoutAction } from "@/lib/account-actions";

type Row = [IconName, string, string];

/** 右上の「≡」。設定や投稿者メニューをここにまとめる（TikTokと同じ） */
export function MeMenu({ isCreator, isAdmin }: { isCreator: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  // ヘッダーは backdrop-filter を持つため、その中で position:fixed を使うと
  // 画面ではなくヘッダー基準で配置され、シートが上に出てしまう。body 直下に出して防ぐ。
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  const creator: Row[] = isCreator
    ? [["video", "動画を投稿する", "/creator/new"], ["file", "自分の投稿を管理", "/creator/videos"], ["chart", "投稿者ダッシュボード", "/creator/dashboard"]]
    : [["video", "投稿者になる", "/creator/apply"]];
  const rows: Row[] = [
    ...creator,
    ["user", "プロフィールを編集", "/me/edit"],
    ["bookmark", "コレクション", "/collections"],
    ["gauge", "視聴履歴", "/history"],
    ["bell", "お知らせ", "/notifications"],
    ["palette", "アプリの見た目", "/settings/theme"],
    ["sliders", "設定とプライバシー", "/settings"],
    ...(isAdmin ? ([["shield", "運営の管理画面", "/admin"]] as Row[]) : []),
  ];
  return (
    <>
      <button className="iconbtn" onClick={() => setOpen(true)} aria-label="メニュー" aria-expanded={open}><Icon name="menu" /></button>
      {open && mounted && createPortal(
        <>
          <div className="sheet-bg" onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="メニュー">
            <span className="grab" />
            <div className="hd"><b style={{ fontSize: 20 }}>メニュー</b><button className="iconbtn" style={{ marginRight: -8 }} onClick={() => setOpen(false)} aria-label="閉じる"><Icon name="x" size={22} /></button></div>
            <div className="list" style={{ background: "var(--surface-2)" }}>
              {rows.map(([icon, label, href]) => (
                <Link key={href} className="row" href={href} onClick={() => setOpen(false)}>
                  <span style={{ color: "var(--accent)" }}><Icon name={icon} size={21} /></span><span className="grow">{label}</span><span className="muted"><Icon name="chev" size={18} /></span>
                </Link>
              ))}
            </div>
            <form action={logoutAction}><button className="btn btn-secondary pill" style={{ color: "var(--bad)" }}><Icon name="logout" size={19} />ログアウト</button></form>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
