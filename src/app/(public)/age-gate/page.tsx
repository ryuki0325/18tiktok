import Link from "next/link";
import { GateForm } from "./GateForm";

export const metadata = { title: "年齢確認", robots: { index: false, follow: false } };

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/age-gate") ? n : "/");

export default async function AgeGate({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="shell">
      <div className="center-screen gate-bg">
        <div className="brand">VYBE</div>
        <div className="brand-sub">18+ ONLY</div>
        <div style={{ display: "inline-block", border: "1px solid var(--accent)", borderRadius: 8, padding: "6px 14px", margin: "40px 0 0", fontSize: 13, fontWeight: 700, letterSpacing: ".04em", color: "var(--accent)" }}>18歳未満閲覧禁止</div>
        <h1 style={{ fontSize: 24, margin: "20px 0 10px" }}>18歳以上ですか？</h1>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 36px" }}>このサービスは成人向けの内容を含みます。<br />18歳未満の方の閲覧は固くお断りします。</p>
        <GateForm next={safeNext(next)} />
        <p className="muted" style={{ fontSize: 11, lineHeight: 1.6, margin: "40px 0 0", maxWidth: 320 }}>当サイトはアフィリエイト広告を提供しています。掲載作品は提携先サービスの正規流通作品で、本編は各公式サイトでご視聴いただけます。</p>
        <nav style={{ display: "flex", gap: 20, marginTop: 24, fontSize: 12 }} className="muted">
          <Link href="/legal/terms" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>利用規約</Link>
          <Link href="/legal/privacy" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>プライバシーポリシー</Link>
          <Link href="/legal/operator" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>運営者情報</Link>
        </nav>
      </div>
    </main>
  );
}
