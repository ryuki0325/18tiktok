import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ageGateSessions } from "@/db/schema";
import { makeAgToken, AG_COOKIE } from "@/lib/agegate-token";
import { sha256 } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "年齢確認", robots: { index: false, follow: false } };

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/age-gate") ? n : "/");

async function accept(formData: FormData) {
  "use server";
  const conn = await db();
  const days = await getSetting("age_gate.ttl_days", conn);
  const version = await getSetting("age_gate.version", conn);
  const expiresAt = new Date(Date.now() + days * 86400_000);
  const ua = (await headers()).get("user-agent") ?? "";
  const [row] = await conn.insert(ageGateSessions).values({ gateVersion: version, uaHash: sha256(ua).slice(0, 32), expiresAt }).returning();
  (await cookies()).set(AG_COOKIE, makeAgToken(row.id, expiresAt), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
  const next = safeNext(formData.get("next"));
  const onboarded = (await cookies()).get("onb")?.value === "1";
  redirect(onboarded || next !== "/" ? next : "/welcome/tags");
}

async function decline() {
  "use server";
  redirect("/leave");
}

export default async function AgeGate({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="shell">
      <div className="center-screen gate-bg">
        <div className="brand">Glow</div>
        <div className="brand-sub">18+ ONLY</div>
        <h1 style={{ fontSize: 24, margin: "56px 0 10px" }}>18歳以上ですか？</h1>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 36px" }}>このサービスは18歳以上の方のみ<br />ご利用いただけます。</p>
        <form action={accept} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          <input type="hidden" name="next" value={safeNext(next)} />
          <button className="cta" type="submit">はい、18歳以上です</button>
          <button className="btn btn-outline pill" style={{ height: 52 }} formAction={decline}>いいえ、退出する</button>
        </form>
        <nav style={{ display: "flex", gap: 20, marginTop: 56, fontSize: 12 }} className="muted">
          <Link href="/legal/terms" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>利用規約</Link>
          <Link href="/legal/privacy" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>プライバシーポリシー</Link>
          <Link href="/legal/operator" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>運営者情報</Link>
        </nav>
      </div>
    </main>
  );
}
