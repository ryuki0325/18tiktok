import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { appendChained, audit } from "./ledger";
import { getSetting } from "./settings";
import { checkAffiliateUrl, containsUrl } from "./url";
import { sha256 } from "./crypto";

/* 通報・案件・措置は src/lib/safety.ts に移した（動画以外も扱うため） */

export async function postComment(conn: DB, input: { videoId: string; userId: string; body: string; parentId?: string | null }) {
  const body = input.body.trim();
  if (!body) return { ok: false as const, error: "コメントを入力してください" };
  if (body.length > 300) return { ok: false as const, error: "コメントは300文字までです" };
  if (containsUrl(body)) return { ok: false as const, error: "コメントにURLは書けません" };
  const [author] = await conn.select().from(s.users).where(eq(s.users.id, input.userId));
  if (!author) return { ok: false as const, error: "利用者が見つかりません" };
  const { activeLimits } = await import("./safety");
  const limits = activeLimits(author);
  if (limits.banned || limits.suspended) return { ok: false as const, error: "現在コメントできません" };
  if (limits.commentBanned) return { ok: false as const, error: "コメントの投稿を停止されています" };
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

  let link: { url: string; domain: string; destinationId: string | null; status: "active" | "pending_domain_review" } | null = null;
  if (input.link?.trim()) {
    const chk = await checkDestinationUrl(conn, input.link);
    if (!chk.ok) return { ok: false as const, error: chk.error };
    link = chk.link;
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
    if (link) await tx.insert(s.outboundLinks).values({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 16), videoId: v.id, destinationId: link.destinationId, url: link.url, domain: link.domain, status: link.status });
    // 運営の審査キューに積む。新規の投稿者ほど先に見る
    const { openCase } = await import("./safety");
    await openCase(t, {
      kind: "video_review", targetType: "video", targetId: v.id, ownerId: input.creatorId,
      priority: cp.approvedPosts < fullReviewCount ? "high" : "medium",
      summary: `審査待ち：${input.title}`,
    });
    return { ok: true as const, video: v, linkPending: link?.status === "pending_domain_review" };
  });
}

/**
 * 動画の審査。承認は approved を経由して published にするので、審査を飛ばせない。
 * 自動チェックは今は入れていないため、すべてここに来る（枠は video-state 側に用意済み）。
 */
export async function reviewVideo(conn: DB, adminId: string, videoId: string, decision: "approve" | "reject", note: string) {
  const { approveAndPublish, transition } = await import("./video-state");
  const { closeCase } = await import("./safety");
  const [v] = await conn.select().from(s.videos).where(eq(s.videos.id, videoId));
  if (!v || v.status !== "pending_review") return false;
  if (decision === "approve") {
    const row = await approveAndPublish(conn, videoId, adminId);
    if (!row) return false;
    await conn.update(s.creatorProfiles).set({ approvedPosts: sql`${s.creatorProfiles.approvedPosts} + 1` }).where(eq(s.creatorProfiles.userId, v.creatorId));
    await conn.insert(s.notifications).values({ userId: v.creatorId, kind: "video_approved", body: `「${v.title}」が公開されました` });
  } else {
    const reason = note || "ガイドラインに沿っていません";
    await transition(conn, { videoId, to: "rejected", statusReason: reason, actorId: adminId });
    await conn.insert(s.notifications).values({ userId: v.creatorId, kind: "video_rejected", body: `「${v.title}」を差し戻しました。理由：${reason}` });
  }
  await conn.insert(s.videoReviews).values({ videoId, adminId, decision, note: note || null });
  // 審査キューの案件を閉じる
  const [c] = await conn.select({ id: s.moderationCases.id }).from(s.moderationCases)
    .where(and(eq(s.moderationCases.targetType, "video"), eq(s.moderationCases.targetId, videoId), eq(s.moderationCases.kind, "video_review")));
  if (c) await closeCase(conn, adminId, c.id, decision === "approve" ? "承認して公開" : "差し戻し", note, decision === "approve" ? "resolved_restored" : "resolved_removed");
  await audit(conn, adminId, `video.${decision}`, "video", videoId, { note });
  return true;
}

export async function recordClick(conn: DB, input: { linkId: string; viewerKey: string; isBot: boolean; creatorKey: string }) {
  const [link] = await conn.select().from(s.outboundLinks).where(eq(s.outboundLinks.id, input.linkId));
  if (!link || link.status !== "active") return null;
  const [v] = await conn.select({ status: s.videos.status, creatorId: s.videos.creatorId }).from(s.videos).where(eq(s.videos.id, link.videoId));
  if (!v || v.status !== "published") return null;
  // 送客先が止められていたら通さない（管理画面からの一括停止がここで効く）
  if (link.destinationId) {
    const [d] = await conn.select({ status: s.destinations.status }).from(s.destinations).where(eq(s.destinations.id, link.destinationId));
    if (!d || d.status !== "approved") return null;
  }
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
  const clickId = crypto.randomUUID().replace(/-/g, "");
  await conn.insert(s.linkClicks).values({
    clickId, linkId: link.id, videoId: link.videoId, creatorId: v.creatorId, destinationId: link.destinationId,
    viewerKey: input.viewerKey, isValid: !invalid, invalidReason: invalid,
  });
  return { url: link.url, valid: !invalid, reason: invalid, clickId };
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

/**
 * 「完全版を見る」のURLを確かめる。
 * 投稿者が任意のURLを貼れる形にはせず、運営が承認した送客先（destinations）のものに限る。
 */
export async function checkDestinationUrl(conn: DB, raw: string) {
  const chk = checkAffiliateUrl(raw, await getSetting("shortener_domains", conn));
  if (!chk.ok) return { ok: false as const, error: chk.reason };
  const [dest] = await conn.select().from(s.destinations).where(eq(s.destinations.domain, chk.domain));
  if (!dest) return { ok: false as const, error: "この送客先は登録されていません。運営に追加を依頼してください" };
  if (dest.status === "rejected") return { ok: false as const, error: "この送客先は使えません" };
  if (dest.urlPattern) {
    let re: RegExp;
    try { re = new RegExp(dest.urlPattern); } catch { re = /.^/; }
    if (!re.test(chk.url)) return { ok: false as const, error: `${dest.serviceName} のリンクの形が違います。自分のページのURLを貼ってください` };
  }
  return {
    ok: true as const,
    link: {
      url: chk.url, domain: chk.domain, destinationId: dest.id,
      status: (dest.status === "approved" ? "active" : "pending_domain_review") as "active" | "pending_domain_review",
    },
  };
}
