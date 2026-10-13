"use client";
import { useState } from "react";
import { Icon } from "./Icon";

/**
 * PC表示のQRカード。初期表示は必須（既定で開く）だが、×で閉じられる。
 * 閉じると小さな「スマホで開く」チップになり、押せば再表示できる（再読み込みでも再表示）。
 */
export function DesktopQrCard({ qr }: { qr: string }) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button type="button" className="desk-qr-reopen" aria-label="QRコードを表示" onClick={() => setOpen(true)}>
        <Icon name="camera" size={16} /> スマホで開く
      </button>
    );
  }
  return (
    <aside className="desk-qr" aria-label="スマホで開く">
      <button type="button" className="desk-qr-x" aria-label="閉じる" onClick={() => setOpen(false)}><Icon name="x" size={16} /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="このサイトを開くQRコード" />
      <b style={{ fontSize: 15 }}>スマホで開いてください</b>
      <span className="cap" style={{ lineHeight: 1.6 }}>VYBE はスマートフォン向けのサイトです。カメラでQRコードを読み取ると、スマホで開けます。</span>
    </aside>
  );
}
