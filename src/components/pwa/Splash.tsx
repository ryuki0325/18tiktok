"use client";
import { useEffect, useState } from "react";

/**
 * ホーム画面から開いたときの起動画面。
 * iPhone はアプリを起こす間、真っ白な画面が一瞬出る。最初のHTMLに黒＋ロゴを入れておき、
 * 画面の準備ができたら消すことで、アプリのような立ち上がりに見せる。
 * （ブラウザで見ているときは最初から表示しない）
 */
export function Splash() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const el = document.getElementById("splash");
    if (!el) return;
    // 1フレーム待ってから消す（内容が描かれる前に消えないように）
    const t = setTimeout(() => { el.classList.add("off"); setTimeout(() => setGone(true), 420); }, 260);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <div id="splash" aria-hidden="true">
      <span className="brand">VYBE</span>
      <span className="brand-sub">18+ ONLY</span>
    </div>
  );
}
