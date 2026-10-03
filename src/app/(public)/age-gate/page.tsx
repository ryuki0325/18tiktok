import Link from "next/link";
import { GateForm } from "./GateForm";

export const metadata = { title: "年齢確認", robots: { index: false, follow: false } };

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/age-gate") ? n : "/");

export default async function AgeGate({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="shell">
      <div className="center-screen gate-bg">
        <div className="brand">Glow</div>
        <div className="brand-sub">18+ ONLY</div>
        <h1 style={{ fontSize: 24, margin: "56px 0 10px" }}>18歳以上ですか？</h1>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 36px" }}>このサービスは18歳以上の方のみ<br />ご利用いただけます。</p>
        <GateForm next={safeNext(next)} />
        <nav style={{ display: "flex", gap: 20, marginTop: 56, fontSize: 12 }} className="muted">
          <Link href="/legal/terms" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>利用規約</Link>
          <Link href="/legal/privacy" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>プライバシーポリシー</Link>
          <Link href="/legal/operator" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>運営者情報</Link>
        </nav>
      </div>
    </main>
  );
}
