import { headers } from "next/headers";
import QRCode from "qrcode";

/** PCで開いたときだけ表示：スマホで開くためのQRコード（スマホ専用サイトのため） */
export async function DesktopQr() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/`;
  const qr = await QRCode.toDataURL(url, { margin: 0, width: 320 });
  return (
    <aside className="desk-qr" aria-label="スマホで開く">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="このサイトを開くQRコード" />
      <b style={{ fontSize: 15 }}>スマホで開いてください</b>
      <span className="cap" style={{ lineHeight: 1.6 }}>VYBE はスマートフォン向けのサイトです。カメラでQRコードを読み取ると、スマホで開けます。</span>
    </aside>
  );
}
