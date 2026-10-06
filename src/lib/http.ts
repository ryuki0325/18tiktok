import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { ageGateOk, regionBlocked } from "./auth";
import { sha256 } from "./crypto";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (code: string, message: string, status = 400) => NextResponse.json({ error: { code, message } }, { status });

/** CSRF対策：状態を変えるリクエストは同一オリジンのみ */
export async function sameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

/** コンテンツ系APIの前段：同意なし→451、地域ブロック→451 */
export async function contentGuard(opts: { write?: boolean } = {}): Promise<NextResponse | null> {
  if (opts.write && !(await sameOrigin())) return fail("BAD_ORIGIN", "不正なリクエストです", 403);
  if (await regionBlocked()) return fail("REGION_UNAVAILABLE", "この地域ではご利用いただけません", 451);
  if (!(await ageGateOk())) return fail("AGE_GATE_REQUIRED", "年齢確認が必要です", 451);
  return null;
}

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return sha256("ip|" + ip).slice(0, 32);
}

/** 固定ウィンドウのレート制限。超えたら false */
/** いま何回めかを数えずに、上限に達しているかだけを見る（失敗したときだけ数えたいときに使う） */
export async function rateLimitPeek(key: string, limit: number, windowSec: number): Promise<boolean> {
  const conn = await db();
  const windowStart = new Date(Math.floor(Date.now() / 1000 / windowSec) * windowSec * 1000);
  const [row] = await conn.select({ count: rateLimits.count }).from(rateLimits).where(eq(rateLimits.key, `${key}|${windowStart.getTime()}`));
  return (row?.count ?? 0) < limit;
}

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const conn = await db();
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 1000 / windowSec) * windowSec * 1000);
  const k = `${key}|${windowStart.getTime()}`;
  const [row] = await conn.insert(rateLimits).values({ key: k, count: 1, windowStart })
    .onConflictDoUpdate({ target: rateLimits.key, set: { count: sql`${rateLimits.count} + 1` } })
    .returning();
  if (Math.random() < 0.01) await conn.delete(rateLimits).where(sql`${rateLimits.windowStart} < now() - interval '1 day'`);
  return row.count <= limit;
}

export function isBotUa(ua: string | null): boolean {
  if (!ua) return true;
  return /bot|crawl|spider|slurp|headless|curl|wget|python-requests|httpclient|phantom|puppeteer|playwright/i.test(ua);
}
