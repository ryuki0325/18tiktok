"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const noop = () => () => {};
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/** 「ホーム画面に追加」の案内。Android/Chrome はボタン1つで、iPhone は手順を表示 */
export function InstallPrompt() {
  const standalone = useSyncExternalStore(noop, isStandalone, () => true);
  const ios = useSyncExternalStore(noop, isIOS, () => false);
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);
  if (standalone || done) return null;
  if (!evt && !ios) return null;
  return (
    <div className="card" style={{ padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={48} height={48} style={{ borderRadius: 12, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 15 }}>ホーム画面に追加</b>
        {evt ? <p className="cap" style={{ margin: "2px 0 0" }}>アプリのように全画面で、すぐに開けます。</p>
          : <p className="cap" style={{ margin: "2px 0 0", lineHeight: 1.6 }}>Safariの共有ボタン（四角に上向き矢印）→「ホーム画面に追加」で、アプリのように全画面で開けます。</p>}
      </div>
      {evt && <button className="btn btn-sm btn-primary" onClick={async () => { await evt.prompt(); await evt.userChoice; setDone(true); }}>追加</button>}
    </div>
  );
}
