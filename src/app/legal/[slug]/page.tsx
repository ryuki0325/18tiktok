import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { getSetting } from "@/lib/settings";
import { Icon } from "@/components/Icon";

const PAGES: Record<string, string> = {
  terms: "利用規約", privacy: "プライバシーポリシー", guidelines: "投稿ガイドライン",
  "takedown-policy": "削除・権利侵害申告ポリシー", operator: "運営者情報", tokushoho: "特定商取引法に基づく表記",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const t = PAGES[(await params).slug];
  return { title: t ?? "ページ", robots: { index: true, follow: true } };
}

async function operatorBlock() {
  const mode = await getSetting("operator.display_mode");
  const email = await getSetting("operator.contact_email");
  const name = await getSetting("operator.name");
  if (mode === "corporation" && name) return `| 項目 | 内容 |\n|---|---|\n| 運営者 | ${name} |\n| 連絡先 | ${email} |`;
  if (mode === "agent" && name) return `| 項目 | 内容 |\n|---|---|\n| 運営窓口（代理） | ${name} |\n| 連絡先 | ${email} |`;
  return `| 項目 | 内容 |\n|---|---|\n| 運営窓口 | ${email} |\n| 問い合わせ | [フォーム](/takedown) |`;
}

/** 法務ページ（年齢確認の外・検索エンジンに載せてよい）。文面は弁護士確認前の仮文面 */
export default async function Legal({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!PAGES[slug]) notFound();
  let md = await fs.readFile(path.join(process.cwd(), "content", "legal", `${slug}.md`), "utf8");
  if (md.includes("{{operator}}")) md = md.replace("{{operator}}", await operatorBlock());
  md = md.replace(/ \{#([a-z-]+)\}/g, (_, id) => `<a id="${id}"></a>`);
  const html = await marked.parse(md);
  return (
    <main className="shell">
      <div className="navbar"><Link className="iconbtn" href="/" aria-label="戻る"><Icon name="back" /></Link><h1>{PAGES[slug]}</h1><span className="sp44" /></div>
      <div className="sec" style={{ paddingBottom: 40 }}>
        <div className="notice warn" role="note"><Icon name="alert" size={18} />弁護士確認前の仮文面です。正式な公開前に内容が変わります。</div>
        <article className="prose-legal" dangerouslySetInnerHTML={{ __html: html }} />
        <nav className="cap" style={{ display: "flex", flexWrap: "wrap", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          {Object.entries(PAGES).map(([k, v]) => <Link key={k} href={`/legal/${k}`} style={{ textDecoration: "underline" }}>{v}</Link>)}
        </nav>
      </div>
    </main>
  );
}
