import "server-only";
import { headers } from "next/headers";

/**
 * メール送信。MAIL_PROVIDER=resend と RESEND_API_KEY・MAIL_FROM が設定されていれば Resend で送る。
 * 未設定の間はサーバーのログに出すだけ（delivered: false）。
 */
export async function sendMail(m: { to: string; subject: string; text: string }): Promise<{ delivered: boolean }> {
  const provider = process.env.MAIL_PROVIDER;
  if (provider === "resend" && process.env.RESEND_API_KEY && process.env.MAIL_FROM) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: [m.to], subject: m.subject, text: m.text }),
      });
      if (r.ok) return { delivered: true };
      console.error("[glow] メール送信に失敗しました", r.status, await r.text().catch(() => ""));
    } catch (e) {
      console.error("[glow] メール送信に失敗しました", e);
    }
    return { delivered: false };
  }
  console.info(`[glow] （メール未設定のためログに出力）宛先: ${m.to} / 件名: ${m.subject}\n${m.text}`);
  return { delivered: false };
}

export const mailConfigured = () => process.env.MAIL_PROVIDER === "resend" && !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

/** メール本文に入れる絶対URL（APP_URL があればそれ、なければリクエストのホストから） */
export async function absoluteUrl(path: string) {
  if (process.env.APP_URL) return new URL(path, process.env.APP_URL).toString();
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}
