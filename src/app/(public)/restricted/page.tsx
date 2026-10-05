import Link from "next/link";
import { Icon } from "@/components/Icon";

export const metadata = { title: "ご利用いただけません" };

/** 運営が成人向けの表示を制限したアカウント向けの案内 */
export default function Restricted() {
  return (
    <div className="shell">
      <div className="center-screen">
        <span style={{ color: "var(--warn)" }}><Icon name="alert" size={44} /></span>
        <h1 style={{ fontSize: 22, margin: "16px 0 8px" }}>現在ご利用いただけません</h1>
        <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.7, maxWidth: 330 }}>
          このアカウントでは成人向けの内容を表示しない設定になっています。
          心当たりがない場合や、解除をご希望の場合は運営までお問い合わせください。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20, width: "100%", maxWidth: 320 }}>
          <Link className="btn btn-primary pill" href="/legal/operator">運営に問い合わせる</Link>
          <Link className="btn btn-secondary pill" href="/settings/account">アカウントの設定</Link>
        </div>
      </div>
    </div>
  );
}
