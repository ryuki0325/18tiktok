import { createHash, createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

let cached: string | null = null;
let warned = false;

/**
 * 署名・ハッシュ用の秘密鍵。
 * 1) 環境変数 AUTH_SECRET（推奨）
 * 2) 未設定なら .data/auth-secret を自動で作って使う（Render などで設定し忘れても動くように）。
 *    この場合、サーバーのディスクが消えると鍵も変わり、全員の年齢確認・ログインがやり直しになる。
 */
export function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return s;
  if (cached) return cached;
  cached = fileSecret();
  if (!warned) {
    warned = true;
    console.warn("[glow] AUTH_SECRET が未設定のため、.data/auth-secret に自動生成した鍵を使っています。本番では AUTH_SECRET（32文字以上）を設定してください。");
  }
  return cached;
}

function fileSecret(): string {
  const dir = path.join(process.cwd(), ".data");
  const file = path.join(dir, "auth-secret");
  try { const v = readFileSync(file, "utf8").trim(); if (v.length >= 32) return v; } catch {}
  mkdirSync(dir, { recursive: true });
  // 同時に作ろうとした場合は先に書いた方を使う（wx = 既にあれば失敗）
  try { writeFileSync(file, randomBytes(48).toString("base64url"), { flag: "wx", mode: 0o600 }); } catch {}
  return readFileSync(file, "utf8").trim();
}

export const secretSource = () => (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 ? "env" : "auto");

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (s: string) => createHmac("sha256", secret()).update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** パスワード：scrypt（N=2^15）。形式 "scrypt$N$salt$hash" */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const N = 32768;
  const key = await scrypt(pw.normalize("NFKC"), salt, 64, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(pw.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n), r: 8, p: 1, maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** 追記型ログのハッシュチェーン */
export function chainHash(prevHash: string, payload: unknown): string {
  return sha256(prevHash + "|" + canonical(payload));
}

/** キー順を固定し、null/undefined を除いた JSON（挿入時とDBから読んだ時で同じ文字列になる） */
export function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
    return "{" + entries.map(([k, x]) => JSON.stringify(k) + ":" + canonical(x)).join(",") + "}";
  }
  return JSON.stringify(v);
}
export const GENESIS = "0".repeat(64);
