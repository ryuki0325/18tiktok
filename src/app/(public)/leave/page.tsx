import Link from "next/link";
import { Icon } from "@/components/Icon";

export const metadata = { title: "ご利用いただけません" };

export default function Leave() {
  return (
    <main className="shell">
      <div className="center-screen">
        <div className="ring" style={{ color: "var(--muted)", background: "var(--surface)", boxShadow: "none" }}><Icon name="ban" size={34} /></div>
        <h1 style={{ fontSize: 22, margin: "28px 0 10px" }}>ご利用いただけません</h1>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 28px" }}>このサービスは18歳以上の方のみが対象です。<br />ご理解ありがとうございました。</p>
        <Link className="btn btn-secondary" href="/age-gate">年齢確認に戻る</Link>
      </div>
    </main>
  );
}
