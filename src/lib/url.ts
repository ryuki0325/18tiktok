/**
 * アフィリエイトURLの検証（docs/04 §7）
 * 拒否：非https、IP直書き、ポート指定、ユーザー情報、短縮URL、制御文字、二重エンコード、IDN（xn--）
 */
export type UrlCheck =
  | { ok: true; url: string; domain: string }
  | { ok: false; reason: string };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const NUMERIC_HOST = /^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+))*$/i;

/** eTLD+1 の簡易版（.co.jp などの2段TLDに対応） */
const SECOND_LEVEL = new Set(["co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp", "ad.jp", "ed.jp", "gr.jp", "lg.jp", "co.uk", "org.uk", "com.au", "co.kr", "com.tw", "com.cn"]);
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  return SECOND_LEVEL.has(last2) ? parts.slice(-3).join(".") : last2;
}

export function checkAffiliateUrl(input: string, shorteners: readonly string[]): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "URLを入力してください" };
  if (raw.length > 2048) return { ok: false, reason: "URLが長すぎます" };
  if (/[\u0000-\u001F\u007F\s\\]/.test(raw)) return { ok: false, reason: "使えない文字が含まれています" };
  if (/%25[0-9a-f]{2}/i.test(raw)) return { ok: false, reason: "二重にエンコードされたURLは使えません" };
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: "URLの形式が正しくありません" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "https:// で始まるURLのみ使えます" };
  if (u.username || u.password) return { ok: false, reason: "ユーザー情報を含むURLは使えません" };
  if (u.port) return { ok: false, reason: "ポート番号を指定したURLは使えません" };
  const host = u.hostname.toLowerCase();
  if (host.startsWith("[") || host.includes(":") || IPV4.test(host) || NUMERIC_HOST.test(host)) return { ok: false, reason: "IPアドレスのURLは使えません" };
  if (!host.includes(".")) return { ok: false, reason: "ドメインが正しくありません" };
  if (host.split(".").some((p) => p.startsWith("xn--"))) return { ok: false, reason: "国際化ドメインは審査が必要なため、今は使えません" };
  const domain = registrableDomain(host);
  if (shorteners.includes(domain) || shorteners.includes(host)) return { ok: false, reason: "短縮URLは使えません。リンク先のURLをそのまま入力してください" };
  return { ok: true, url: u.toString(), domain };
}

/** コメント等にURLが含まれるか */
export const containsUrl = (s: string) => /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|jp|org|io|me|xyz|info|link)\b)/i.test(s);
