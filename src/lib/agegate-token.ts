import { createHmac, timingSafeEqual } from "node:crypto";
import { secret } from "./crypto";

/** 年齢確認Cookie "ag" = <sessionId>.<期限(epoch秒)>.<HMAC>。proxy とサーバーの両方で検証する */
export const AG_COOKIE = "ag";

const sign = (body: string) => createHmac("sha256", secret()).update("ag|" + body).digest("base64url");

export function makeAgToken(sessionId: string, expiresAt: Date): string {
  const body = `${sessionId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  return `${body}.${sign(body)}`;
}

export function readAgToken(token: string | undefined | null, now = Date.now()): { sessionId: string; exp: number } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  if (!/^[0-9a-f-]{36}$/.test(id) || Number(exp) * 1000 < now) return null;
  return { sessionId: id, exp: Number(exp) };
}
