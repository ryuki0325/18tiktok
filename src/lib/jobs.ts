import "server-only";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { audit } from "./ledger";
import { getSetting } from "./settings";
import { registrableDomain } from "./url";

/**
 * 外部リンクの死活確認（F-6）。
 * - 転送（リダイレクト）を最大5回たどり、最後に着いたドメインが許可リストに無ければ無効化（後から悪質なサイトに差し替える手口への対策）
 * - 3回続けて開けなければ無効化
 * - 社内のIPやローカルホストに向かう転送はたどらない
 */
export async function linkHealthcheck(conn: DB, limit = 200) {
  const allowed = new Set((await conn.select({ d: s.affiliateDomains.domain }).from(s.affiliateDomains).where(eq(s.affiliateDomains.isActive, true))).map((r) => r.d));
  const links = await conn.select().from(s.outboundLinks).where(eq(s.outboundLinks.status, "active")).orderBy(sql`${s.outboundLinks.lastCheckedAt} nulls first`).limit(limit);
  let ok = 0, disabled = 0, failed = 0;
  for (const l of links) {
    const r = await probe(l.url);
    const now = new Date();
    if (r.kind === "ok" && !allowed.has(registrableDomain(r.finalHost))) {
      await conn.update(s.outboundLinks).set({ status: "disabled_healthcheck", lastCheckedAt: now, lastCheckStatus: `許可外のドメインへ転送：${r.finalHost}` }).where(eq(s.outboundLinks.id, l.id));
      disabled++;
    } else if (r.kind === "ok") {
      await conn.update(s.outboundLinks).set({ lastCheckedAt: now, lastCheckStatus: `OK ${r.status}`, checkFailures: 0 }).where(eq(s.outboundLinks.id, l.id));
      ok++;
    } else {
      const fails = l.checkFailures + 1;
      await conn.update(s.outboundLinks).set({ lastCheckedAt: now, lastCheckStatus: r.reason, checkFailures: fails, ...(fails >= 3 ? { status: "disabled_healthcheck" as const } : {}) }).where(eq(s.outboundLinks.id, l.id));
      if (fails >= 3) disabled++; else failed++;
    }
  }
  await audit(conn, null, "job.link_healthcheck", "outbound_links", null, { checked: links.length, ok, failed, disabled });
  return { checked: links.length, ok, failed, disabled };
}

const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[|::1)/;

async function probe(url: string): Promise<{ kind: "ok"; status: number; finalHost: string } | { kind: "fail"; reason: string }> {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    let u: URL;
    try { u = new URL(current); } catch { return { kind: "fail", reason: "URLが不正" }; }
    if (u.protocol !== "https:" || PRIVATE.test(u.hostname) || /^\d+(\.\d+){3}$/.test(u.hostname)) return { kind: "fail", reason: `安全でない転送先：${u.hostname}` };
    try {
      const res = await fetch(u, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "user-agent": "GlowLinkChecker/1.0" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { kind: "fail", reason: `転送先なし ${res.status}` };
        current = new URL(loc, u).toString();
        continue;
      }
      if (res.status >= 400) return { kind: "fail", reason: `HTTP ${res.status}` };
      return { kind: "ok", status: res.status, finalHost: u.hostname };
    } catch (e) {
      return { kind: "fail", reason: e instanceof Error && e.name === "TimeoutError" ? "応答なし（8秒）" : "接続できません" };
    }
  }
  return { kind: "fail", reason: "転送が多すぎます" };
}

/** 保存期間を過ぎたデータの削除（個人情報は必要最小限に） */
export async function purgeExpired(conn: DB) {
  const viewDays = await getSetting("retention.view_events_days", conn);
  const notifDays = await getSetting("retention.read_notifications_days", conn);
  const day = 86400_000, now = Date.now();
  const del = async (q: Promise<unknown[]>) => (await q).length;
  const result = {
    views: await del(conn.delete(s.views).where(lt(s.views.createdAt, new Date(now - viewDays * day))).returning({ id: s.views.id })),
    linkClicks: await del(conn.delete(s.linkClicks).where(lt(s.linkClicks.createdAt, new Date(now - viewDays * day))).returning({ id: s.linkClicks.id })),
    sessions: await del(conn.delete(s.sessions).where(lt(s.sessions.expiresAt, new Date())).returning({ id: s.sessions.id })),
    emailTokens: await del(conn.delete(s.emailTokens).where(lt(s.emailTokens.expiresAt, new Date())).returning({ id: s.emailTokens.id })),
    ageGateSessions: await del(conn.delete(s.ageGateSessions).where(lt(s.ageGateSessions.expiresAt, new Date(now - 7 * day))).returning({ id: s.ageGateSessions.id })),
    rateLimits: await del(conn.delete(s.rateLimits).where(lt(s.rateLimits.windowStart, new Date(now - day))).returning({ k: s.rateLimits.key })),
    notifications: await del(conn.delete(s.notifications).where(and(isNotNull(s.notifications.readAt), lt(s.notifications.createdAt, new Date(now - notifDays * day)))).returning({ id: s.notifications.id })),
  };
  await audit(conn, null, "job.purge_expired", "retention", null, result);
  return result;
}

