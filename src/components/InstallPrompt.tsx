"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "./Icon";
import { isAndroid, isIOSSafari, isStandalone, markInstalled, type BIPEvent } from "./pwa/pwa";

const noop = () => () => {};

/** 設定画面の「ホーム画面に追加」。Android はボタン1つで、iPhone は手順を表示 */
export function InstallPrompt() {
  const standalone = useSyncExternalStore(noop, isStandalone, () => true);
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [done, setDone] = useState(false);
  const [how, setHow] = useState(false);
  const canAdd = useSyncExternalStore(noop, () => isIOSSafari() || isAndroid(), () => false);
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);
  if (standalone) return (
    <div className="notice info" role="status"><Icon name="check" size={18} /><span>ホーム画面から開いています。</span></div>
  );
  if (done) return <div className="notice info" role="status"><Icon name="check" size={18} /><span>ホーム画面に追加しました。</span></div>;
  if (!canAdd) return null;
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={48} height={48} style={{ borderRadius: 12, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 15 }}>ホーム画面に追加</b>
          <p className="cap" style={{ margin: "2px 0 0", lineHeight: 1.5 }}>全画面ですぐ開けて、動画の読み込みも速くなります。</p>
        </div>
        {evt ? <button className="btn btn-sm btn-primary" onClick={async () => { await evt.prompt(); const r = await evt.userChoice; if (r.outcome === "accepted") { markInstalled(); setDone(true); } }}>追加</button>
          : <button className="btn btn-sm btn-secondary" onClick={() => setHow((v) => !v)}>手順</button>}
      </div>
      {how && (
        <ol className="steps">
          <li><span className="n">1</span><span>画面の下にある<b> 共有ボタン</b>（四角から上向きの矢印）を押します<span className="ic"><Icon name="share" size={20} /></span></span></li>
          <li><span className="n">2</span><span>メニューを下にスクロールして<b>「ホーム画面に追加」</b>を選びます</span></li>
          <li><span className="n">3</span><span>右上の<b>「追加」</b>を押すと完了です</span></li>
        </ol>
      )}
    </div>
  );
}
