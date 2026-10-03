import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { appendChained, audit } from "./ledger";
import { getSetting } from "./settings";
import { checkAffiliateUrl, containsUrl } from "./url";
import { sha256 } from "./crypto";

/* ================= 通報（docs/04 §8） ================= */
export const REASON_LABEL: Record<s.ReportReason, string> = {
  minor_suspected: "未成年の疑い",
  non_consensual: "同意のない撮影・盗撮",
  unauthorized_repost: "無断転載",
  inappropriate: "不適切なコンテンツ",
  other: "その他",
};
const PRIORITY: Record<s.ReportReason, "P0" | "P1" | "P2"> = {
  minor_suspected: "P0", non_consensual: "P0", unauthorized_repost: "P1", inappropriate: "P1", other: "P2",
};
const IMMEDIATE: s.ReportReason[] = ["minor_suspected", "non_consensual"];

export async function fileReport(conn: DB, input: { videoId: string; reason: s.ReportReason; detail?: string; reporterKey: string }) {
  const sla = await getSetting("report.sla_hours", conn);
  const priority = PRIORITY[input.reason];
  return conn.transaction(async (tx) => {
    const t = tx as unknown as DB;
    const [video] = await tx.select().from(s.videos).where(eq(s.videos.id, input.videoId));
    if (!video) return { ok: false as const, error: "動画が見つかりません" };
    const inserted = await tx.insert(s.reportTickets).values({
      videoId: input.videoId, reason: input.reason, detail: input.detail ?? null, reporterKey: input.reporterKey,
      priority, slaDueAt: new Date(Date.now() + sla[priority] * 3600_000),
    }).onConflictDoNothing().returning();
    if (!inserted.length) return { ok: true as const, duplicate: true, hidden: video.status === "hidden_by_report" };
    const ticket = inserted[0];

    let hide = IMMEDIATE.includes(input.reason);
    if (!hide) {
      const key = `report.auto_hide_threshold.${input.reason}` as "report.auto_hide_threshold.other";
      const threshold = await getSetting(key, t);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.reportTickets)
        .where(and(eq(s.reportTickets.videoId, input.videoId), eq(s.reportTickets.reason, input.reason), eq(s.reportTickets.status, "open")));
      hide = n >= threshold;
    }
    if (hide && video.status === "published") {
      await tx.update(s.videos).set({ status: "hidden_by_report", statusReason: `通報（${REASON_LABEL[input.reason]}）により確認中` }).where(eq(s.videos.id, input.videoId));
      await tx.update(s.reportTickets).set({ autoHidden: true }).where(eq(s.reportTickets.id, ticket.id));
      await appendChained(t, s.reportActions, { ticketId: ticket.id, adminId: null, action: "auto_hide", note: REASON_LABEL[input.reason] });
    }
    return { ok: true as const, duplicate: false, hidden: hide };
  });
}

/** 運営の対応：復帰 or 削除。同じ動画の未対応の通報もまとめて閉じる */
export async function resolveReport(conn: DB, adminId: string, ticketId: string, decision: "restore" | "remove" | "dismiss", note: string) {
  return conn.transaction(async (tx) => {
    const t = tx as unknown as DB;
    const [ticket] = await tx.select().from(s.reportTickets).where(eq(s.reportTickets.id, ticketId));
    if (!ticket) return false;
    const status = decision === "restore" ? "resolved_restored" : decision === "remove" ? "resolved_removed" : "dismissed";
    const open = await tx.update(s.reportTickets).set({ status }).where(and(eq(s.reportTickets.videoId, ticket.videoId), eq(s.reportTickets.status, "open"))).returning();
    if (decision === "restore") await tx.update(s.videos).set({ status: "published", statusReason: null }).where(and(eq(s.videos.id, ticket.videoId), eq(s.videos.status, "hidden_by_report")));
    if (decision === "remove") {
      const [v] = await tx.update(s.videos).set({ status: "removed", statusReason: note || "規約違反のため削除しました" }).where(eq(s.videos.id, ticket.videoId)).returning();
      if (v) await tx.insert(s.notifications).values({ userId: v.creatorId, kind: "video_removed", body: `「${v.title}」を削除しました。理由：${note || "規約違反"}` });
    }
    for (const o of open) await appendChained(t, s.reportActions, { ticketId: o.id, adminId, action: decision, note });
    await audit(t, adminId, `report.${decision}`, "video", ticket.videoId, { ticketId, note });
    return true;
  });
}

/* ================= コメント ================= */
export async function postComment(conn: DB, input: { videoId: string; userId: string; body: string; parentId?: string | null }) {
  const body = input.body.trim();
  if (!body) return { ok: false as const, error: "コメントを入力してください" };
  if (body.length > 300) return { ok: false as const, error: "コメントは300文字までです" };
  if (containsUrl(body)) return { ok: false as const, error: "コメントにURLは書けません" };
  const [video] = await conn.select().from(s.videos).where(eq(s.videos.id, input.videoId));
  if (!video || video.status !== "published") return { ok: false as const, error: "この動画にはコメントできません" };
  if (!video.commentsEnabled) return { ok: false as const, error: "投稿者がコメントをオフにしています" };
  // 返信は、同じ動画の見えているコメントにだけ付けられる。返信への返信も同じ階層にまとめる（TikTokと同じ）
  let parentId: string | null = null;
  if (input.parentId) {
    const [parent] = await conn.select().from(s.comments).where(eq(s.comments.id, input.parentId));
    if (!parent || parent.videoId !== input.videoId || parent.status !== "visible") return { ok: false as const, error: "返信先のコメントが見つかりません" };
    parentId = parent.parentId ?? parent.id;
  }
  const ng = await getSetting("ng_words", conn);
  const status = ng.some((w) => body.toLowerCase().includes(w.toLowerCase())) ? "pending" : "visible";
  const [c] = await conn.insert(s.comments).values({ videoId: input.videoId, userId: input.userId, body, status, parentId }).returning();
  if (status === "visible") await notifyComment(conn, c, video.creatorId, input.userId);
  return { ok: true as const, comment: c, pending: status === "pending" };
}

/** コメント・返信を相手に知らせる（自分あてには出さない） */
async function notifyComment(conn: DB, c: typeof s.comments.$inferSelect, creatorId: string, authorId: string) {
  const [me] = await conn.select({ handle: s.users.handle }).from(s.users).where(eq(s.users.id, authorId));
  const short = c.body.length > 30 ? c.body.slice(0, 30) + "…" : c.body;
  const rows: (typeof s.notifications.$inferInsert)[] = [];
  if (creatorId !== authorId) rows.push({ userId: creatorId, kind: "comment", body: `@${me.handle} さんがコメントしました：${short}` });
  if (c.parentId) {
    const [parent] = await conn.select({ userId: s.comments.userId }).from(s.comments).where(eq(s.comments.id, c.parentId));
    if (parent && parent.userId !== authorId && parent.userId !== creatorId) rows.push({ userId: parent.userId, kind: "comment", body: `@${me.handle} さんが返信しました：${short}` });
  }
  if (rows.length) await conn.insert(s.notifications).values(rows);
}

export async function reportComment(conn: DB, input: { commentId: string; reason: string; reporterKey: string }) {
  const ins = await conn.insert(s.commentReports).values(input).onConflictDoNothing().returning();
  if (!ins.length) return { hidden: false };
  const threshold = await getSetting("comments.auto_hide_threshold", conn);
  const [{ n }] = await conn.select({ n: sql<number>`count(*)::int` }).from(s.commentReports).where(eq(s.commentReports.commentId, input.commentId));
  const hide = input.reason === "minor_related" || n >= threshold;
  if (hide) await conn.update(s.comments).set({ status: "hidden_by_report" }).where(and(eq(s.comments.id, input.commentId), eq(s.comments.status, "visible")));
  return { hidden: hide };
}

/* ================= 投稿（動画ファイルはまだ扱わない） ================= */
export const CONSENT_VERSION = 1;
export const CONSENT_TEXT = [
  "自分が撮影・出演し、権利を持つ動画です",
  "出演者全員が18歳以上で、公開に同意しています",
  "他人の動画の転載・切り抜きではありません",
];

export async function createVideo(conn: DB, input: {
  creatorId: string; title: string; description: string; tags: string[]; link?: string; category: "women" | "men" | "couple"; intensity: number;
  consents: [boolean, boolean, boolean]; ipHash: string; userAgent: string;
}) {
  if (!input.consents.every(Boolean)) return { ok: false as const, error: "3つの確認事項すべてにチェックが必要です" };
  const [cp] = await conn.select().from(s.creatorProfiles).where(eq(s.creatorProfiles.userId, input.creatorId));
  if (!cp || cp.status !== "approved") return { ok: false as const, error: "投稿者として承認されていません" };
  if (cp.restrictedUntil && cp.restrictedUntil > new Date()) return { ok: false as const, error: "投稿制限中のため投稿できません" };

  let link: { url: string; domain: string; status: "active" | "pending_domain_review" } | null = null;
  if (input.link?.trim()) {
    const chk = checkAffiliateUrl(input.link, await getSetting("shortener_domains", conn));
    if (!chk.ok) return { ok: false as const, error: chk.reason };
    const [allowed] = await conn.select().from(s.affiliateDomains).where(and(eq(s.affiliateDomains.domain, chk.domain), eq(s.affiliateDomains.isActive, true)));
    link = { url: chk.url, domain: chk.domain, status: allowed ? "active" : "pending_domain_review" };
  }
  const fullReviewCount = await getSetting("review.new_creator_full_review_count", conn);
  const hue: [number, number, number] = [0, 0, 0].map(() => Math.floor(Math.random() * 360)) as [number, number, number];

  return conn.transaction(async (tx) => {
    const t = tx as unknown as DB;
    // 段階審査：最初のN本は必ず審査。実績ランクも「今は」全件審査（自動チェックの実装後に緩める）
    const [v] = await tx.insert(s.videos).values({
      creatorId: input.creatorId, title: input.title, description: input.description, hue, category: input.category, intensity: input.intensity,
      status: "pending_review", reviewRequired: true,
      statusReason: cp.approvedPosts < fullReviewCount ? `新規投稿者の審査（${cp.approvedPosts + 1}/${fullReviewCount}本目）` : null,
    }).returning();
    const tagRows = input.tags.length ? await tx.select().from(s.tags).where(inArray(s.tags.name, input.tags)) : [];
    if (tagRows.length) await tx.insert(s.videoTags).values(tagRows.map((r) => ({ videoId: v.id, tagId: r.id })));
    await appendChained(t, s.videoConsents, {
      videoId: v.id, creatorId: input.creatorId, consentVersion: CONSENT_VERSION, consentTextHash: sha256(CONSENT_TEXT.join("\n")),
      ownsRights: true, performersAdultConsented: true, notReposted: true, ipHash: input.ipHash, userAgent: input.userAgent.slice(0, 300),
    });
    if (link) await tx.insert(s.outboundLinks).values({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 16), videoId: v.id, ...link });
    return { ok: true as const, video: v, linkPending: link?.status === "pending_domain_review" };
  });
}

export async function reviewVideo(conn: DB, adminId: string, videoId: string, decision: "approve" | "reject", note: string) {
  return conn.transaction(async (tx) => {
    const t = tx as unknown as DB;
    const [v] = await tx.select().from(s.videos).where(eq(s.videos.id, videoId));
    if (!v || v.status !== "pending_review") return false;
    if (decision === "approve") {
      await tx.update(s.videos).set({ status: "published", statusReason: null, publishedAt: new Date() }).where(eq(s.videos.id, videoId));
      await tx.update(s.creatorProfiles).set({ approvedPosts: sql`${s.creatorProfiles.approvedPosts} + 1` }).where(eq(s.creatorProfiles.userId, v.creatorId));
      await tx.insert(s.notifications).values({ userId: v.creatorId, kind: "video_approved", body: `「${v.title}」が公開されました` });
    } else {
      await tx.update(s.videos).set({ status: "rejected", statusReason: note || "ガイドラインに沿っていません" }).where(eq(s.videos.id, videoId));
      await tx.insert(s.notifications).values({ userId: v.creatorId, kind: "video_rejected", body: `「${v.title}」を差し戻しました。理由：${note || "ガイドラインに沿っていません"}` });
    }
    await tx.insert(s.videoReviews).values({ videoId, adminId, decision, note });
    await audit(t, adminId, `video.${decision}`, "video", videoId, { note });
    return true;
  });
}

/* ================= 外部リンクのクリック計測（docs/04 §10） ================= */
export async function recordClick(conn: DB, input: { linkId: string; viewerKey: string; isBot: boolean; creatorKey: string }) {
  const [link] = await conn.select().from(s.outboundLinks).where(eq(s.outboundLinks.id, input.linkId));
  if (!link || link.status !== "active") return null;
  const [v] = await conn.select({ status: s.videos.status }).from(s.videos).where(eq(s.videos.id, link.videoId));
  if (!v || v.status !== "published") return null;
  const windowSec = await getSetting("clicks.dedupe_window_sec", conn);
  let invalid: string | null = null;
  if (input.isBot) invalid = "bot";
  else if (input.viewerKey === input.creatorKey) invalid = "self_click";
  else {
    const [recent] = await conn.select({ id: s.linkClicks.id }).from(s.linkClicks)
      .where(and(eq(s.linkClicks.linkId, link.id), eq(s.linkClicks.viewerKey, input.viewerKey), sql`${s.linkClicks.createdAt} > now() - make_interval(secs => ${windowSec})`))
      .orderBy(desc(s.linkClicks.id)).limit(1);
    if (recent) invalid = "dup_window";
  }
  await conn.insert(s.linkClicks).values({ linkId: link.id, videoId: link.videoId, viewerKey: input.viewerKey, isValid: !invalid, invalidReason: invalid });
  return { url: link.url, valid: !invalid, reason: invalid };
}

/** 許可ドメインから外したら、そのドメインのリンクを一括で無効化（F-5） */
export async function removeDomain(conn: DB, adminId: string, domainId: number) {
  return conn.transaction(async (tx) => {
    const [d] = await tx.update(s.affiliateDomains).set({ isActive: false }).where(eq(s.affiliateDomains.id, domainId)).returning();
    if (!d) return 0;
    const disabled = await tx.update(s.outboundLinks).set({ status: "disabled_domain_removed" })
      .where(and(eq(s.outboundLinks.domain, d.domain), eq(s.outboundLinks.status, "active"))).returning();
    await audit(tx as unknown as DB, adminId, "domain.remove", "affiliate_domain", d.domain, { disabledLinks: disabled.length });
    return disabled.length;
  });
}

export async function addDomain(conn: DB, adminId: string, domain: string, displayName: string) {
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(clean)) return { ok: false as const, error: "ドメインの形式が正しくありません" };
  await conn.insert(s.affiliateDomains).values({ domain: clean, displayName: displayName || clean })
    .onConflictDoUpdate({ target: s.affiliateDomains.domain, set: { isActive: true, displayName: displayName || clean } });
  // 審査待ちだったリンクを有効化
  const activated = await conn.update(s.outboundLinks).set({ status: "active" })
    .where(and(eq(s.outboundLinks.domain, clean), eq(s.outboundLinks.status, "pending_domain_review"))).returning();
  await audit(conn, adminId, "domain.add", "affiliate_domain", clean, { activatedLinks: activated.length });
  return { ok: true as const, activated: activated.length };
}

/* ================= 制裁（D-3） ================= */
export const PENALTY_LABEL = { warning: "警告", restriction: "投稿制限", suspension: "一時停止", ban: "BAN", lift: "解除" } as const;

export async function penalize(conn: DB, adminId: string, creatorId: string, level: keyof typeof PENALTY_LABEL, reason: string, days?: number) {
  return conn.transaction(async (tx) => {
    const t = tx as unknown as DB;
    const endsAt = days ? new Date(Date.now() + days * 86400_000) : null;
    await appendChained(t, s.creatorPenalties, { creatorId, level, reason, endsAt, adminId });
    if (level === "restriction") await tx.update(s.creatorProfiles).set({ restrictedUntil: endsAt ?? new Date(Date.now() + 7 * 86400_000) }).where(eq(s.creatorProfiles.userId, creatorId));
    if (level === "suspension") await tx.update(s.creatorProfiles).set({ status: "suspended" }).where(eq(s.creatorProfiles.userId, creatorId));
    if (level === "ban") {
      await tx.update(s.creatorProfiles).set({ status: "banned" }).where(eq(s.creatorProfiles.userId, creatorId));
      await tx.update(s.users).set({ status: "banned" }).where(eq(s.users.id, creatorId));
      await tx.update(s.videos).set({ status: "removed", statusReason: "アカウント停止" }).where(eq(s.videos.creatorId, creatorId));
      await tx.delete(s.sessions).where(eq(s.sessions.userId, creatorId));
    }
    if (level === "lift") {
      await tx.update(s.creatorProfiles).set({ status: "approved", restrictedUntil: null }).where(eq(s.creatorProfiles.userId, creatorId));
      await tx.update(s.users).set({ status: "active" }).where(eq(s.users.id, creatorId));
    }
    if (level !== "warning") {
      await tx.update(s.creatorProfiles).set({ violationPoints: sql`${s.creatorProfiles.violationPoints} + ${level === "lift" ? 0 : 1}` }).where(eq(s.creatorProfiles.userId, creatorId));
    }
    await tx.insert(s.notifications).values({ userId: creatorId, kind: `penalty_${level}`, body: `運営からのお知らせ：${PENALTY_LABEL[level]}（理由：${reason}）` });
    await audit(t, adminId, `creator.${level}`, "user", creatorId, { reason, days });
  });
}
