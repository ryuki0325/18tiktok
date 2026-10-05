"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { api } from "@/components/feed/api";
import { useToast } from "@/components/Toast";
import { ReportSheet } from "@/components/ReportSheet";

/** 他人のプロフィールの「≡」。共有・表示しない・通報 */
export function UserMenu({ creatorId, handle, mine }: { creatorId: string; handle: string; mine: boolean }) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  if (mine) return <Link className="iconbtn" href="/me/edit" aria-label="プロフィールを編集"><Icon name="menu" /></Link>;

  const share = async () => {
    const url = `${location.origin}/u/${encodeURIComponent(handle)}`;
    setOpen(false);
    if (navigator.share) { try { await navigator.share({ title: `@${handle}`, url }); } catch {} return; }
    try { await navigator.clipboard.writeText(url); toast("リンクをコピーしました"); } catch { toast("コピーできませんでした"); }
  };
  const block = async () => {
    setOpen(false);
    const r = await api(`/api/v1/me/blocks/${creatorId}`, { method: "PUT" });
    if (!r.ok) { toast("設定できませんでした"); return; }
    toast(`@${handle} の動画を表示しません（設定から戻せます）`);
    router.push("/");
  };
  return (
    <>
      {reporting && <ReportSheet targetType="profile" targetId={creatorId} label={`@${handle}`} onClose={() => setReporting(false)} />}
      <button className="iconbtn" onClick={() => setOpen(true)} aria-label="メニュー" aria-expanded={open}><Icon name="menu" /></button>
      {open && (
        <>
          <div className="sheet-bg" onClick={() => setOpen(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="メニュー">
            <span className="grab" />
            <div className="hd"><b style={{ fontSize: 20 }}>@{handle}</b><button className="iconbtn" style={{ marginRight: -8 }} onClick={() => setOpen(false)} aria-label="閉じる"><Icon name="x" size={22} /></button></div>
            <div className="acts" role="group" aria-label="操作">
              <button onClick={share}><span className="ic"><Icon name="share" size={24} /></span>共有</button>
              <button onClick={block}><span className="ic"><Icon name="eyeoff" size={24} /></span>表示しない</button>
              <button onClick={() => { setOpen(false); setReporting(true); }}><span className="ic bad"><Icon name="flag" size={24} /></span>報告する</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
