import { headers } from "next/headers";
import QRCode from "qrcode";
import { DesktopQrCard } from "./DesktopQrCard";

/** PCで開いたときだけ表示：スマホで開くためのQRコード（スマホ専用サイトのため）。×で閉じられる */
export async function DesktopQr() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/`;
  const qr = await QRCode.toDataURL(url, { margin: 0, width: 320 });
  return <DesktopQrCard qr={qr} />;
}
