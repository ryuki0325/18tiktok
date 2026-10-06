import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type DB } from "@/db";
import * as s from "@/db/schema";
import type { Priority, ReportReason, ReportTarget, SanctionKind } from "@/db/schema";
import { appendChained, audit } from "./ledger";
import { notifyUser } from "./notify";
import { REASON_SPEC, reasonLabel } from "./report-reasons";
import { transition } from "./video-state";

/* ===================== 通報 ===================== */

export type ReportInput = {
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  description?: string;
  reporterKey: string;
  reporterId?: string | null;
};

/** 通報の対象が実在するか調べ、その持ち主を返す */
async function resolveTarget(conn: DB, t: ReportTarget, id: string): Promise<{ ownerId: string; label: string } | null> {
  if (t === "video") {
    const [v] = await conn.select({ creatorId: s.videos.creatorId, title: s.videos.title, status: s.videos.status })
      .from(s.videos).where(eq(s.videos.id, id));
    return v && v.status !== "deleted" ? { ownerId: v.creatorId, label: v.title } : null;
  }
  if (t === "comment") {
    const [c] = await conn.select({ userId: s.comments.userId, body: s.comments.body, status: s.comments.status })
      .from(s.comments).where(eq(s.comments.id, id));
    return c && c.status !== "removed" ? { ownerId: c.userId, label: c.body.slice(0, 40) } : null;
  }
  const [u] = await conn.select({ id: s.users.id, handle: s.users.handle, status: s.users.status }).from(s.users).where(eq(s.users.id, id));
  return u && u.status !== "deleted" ? { ownerId: u.id, label: `@${u.handle}` } : null;
}

/**
 * 通報を受け付ける。
 * 重い理由（未成年・同意なし・盗撮・リベンジポルノ・違法）は、その場で対象を非公開にする。
 * 軽い理由は決められた件数が集まった時点で非公開にし、どちらも運営の確認待ちに入る。
 */
export async function fileReport(conn: DB, input: ReportInput) {
  const spec = REASON_SPEC[input.reason];
  if (!spec) return { ok: false as const, error: "通報の理由が正しくありません" };
  if (!spec.targets.includes(input.targetType)) return { ok: false as const, error: "この対象にはこの理由を選べません" };

  const target = await resolveTarget(conn, input.targetType, input.targetId);
  if (!target) return { ok: false as const, error: "対象が見つかりません" };
  // 自分で自分を通報しても意味がないので、静かに受け流す
  if (input.reporterId && input.reporterId === target.ownerId) return { ok: true as const, duplicate: true, hidden: false };

  const slaDueAt = new Date(Date.now() + spec.slaHours * 3600_000);
  const inserted = await conn.insert(s.reports).values({
    targetType: input.targetType, targetId: input.targetId, ownerId: target.ownerId,
    reason: input.reason, description: input.description?.slice(0, 1000) || null,
    reporterKey: input.reporterKey, reporterId: input.reporterId ?? null,
    priority: spec.priority, slaDueAt,
  }).onConflictDoNothing().returning();
  if (!inserted.length) return { ok: true as const, duplicate: true, hidden: false };
  const report = inserted[0];

  // 同じ対象への、同じ重さの通報が何件たまっているか
  const [{ n }] = await conn.select({ n: sql<number>`count(*)::int` }).from(s.reports)
    .where(and(eq(s.reports.targetType, input.targetType), eq(s.reports.targetId, input.targetId), eq(s.reports.reason, input.reason)));

  const hide = spec.immediate || (spec.threshold !== undefined && n >= spec.threshold);
  if (hide) {
    await hideTarget(conn, input.targetType, input.targetId, "by_report");
    await conn.update(s.reports).set({ autoActioned: true }).where(eq(s.reports.id, report.id));
  }

  await openCase(conn, {
    kind: "report", targetType: input.targetType, targetId: input.targetId, ownerId: target.ownerId,
    priority: spec.priority, reportId: report.id, dueAt: slaDueAt,
    summary: `${reasonLabel(input.reason)}：${target.label}`,
  });
  return { ok: true as const, duplicate: false, hidden: hide, reportId: report.id };
}

/** 対象を見えない状態にする（削除はしない。運営が確認して戻せる） */
export async function hideTarget(conn: DB, t: ReportTarget, id: string, reason: s.HiddenReason) {
  if (t === "video") {
    await transition(conn, { videoId: id, to: "hidden", hiddenReason: reason, expect: ["published", "approved", "pending_review"] }).catch(() => {});
    return;
  }
  if (t === "comment") {
    await conn.update(s.comments).set({ status: "hidden_by_report" }).where(and(eq(s.comments.id, id), eq(s.comments.status, "visible")));
    return;
  }
  // プロフィールは、持ち主の投稿をまとめて下げる
  const rows = await conn.select({ id: s.videos.id }).from(s.videos)
    .where(and(eq(s.videos.creatorId, id), inArray(s.videos.status, ["published", "approved"])));
  for (const r of rows) await transition(conn, { videoId: r.id, to: "hidden", hiddenReason: reason }).catch(() => {});
}

/** 対象を元に戻す */
export async function restoreTarget(conn: DB, t: ReportTarget, id: string, actorId: string | null) {
  if (t === "video") {
    await transition(conn, { videoId: id, to: "published", actorId, expect: ["hidden"] }).catch(() => {});
    return;
  }
  if (t === "comment") {
    await conn.update(s.comments).set({ status: "visible" }).where(and(eq(s.comments.id, id), inArray(s.comments.status, ["hidden_by_report", "pending"])));
    return;
  }
  const rows = await conn.select({ id: s.videos.id }).from(s.videos)
    .where(and(eq(s.videos.creatorId, id), eq(s.videos.status, "hidden")));
  for (const r of rows) await transition(conn, { videoId: r.id, to: "published", actorId }).catch(() => {});
}

/* ===================== 運営の作業キュー ===================== */

type CaseInput = {
  kind: s.CaseKind; targetType: ReportTarget; targetId: string; ownerId?: string | null;
  priority: Priority; reportId?: string | null; dueAt?: Date | null; summary: string;
};

/**
 * 作業をキューに積む。同じ対象で開いている案件があれば、件数を足して優先度を上げるだけにする。
 * （同じ動画に10件の通報が来ても、運営が見るのは1件）
 */
export async function openCase(conn: DB, c: CaseInput) {
  const [existing] = await conn.select().from(s.moderationCases)
    .where(and(eq(s.moderationCases.targetType, c.targetType), eq(s.moderationCases.targetId, c.targetId), eq(s.moderationCases.kind, c.kind)));
  if (existing) {
    if (existing.status === "closed") {
      // 一度閉じた案件に新しい通報が来たら開き直す
      const [row] = await conn.update(s.moderationCases).set({
        status: "open", priority: higher(existing.priority, c.priority), reportCount: existing.reportCount + 1,
        reportId: c.reportId ?? existing.reportId, dueAt: c.dueAt ?? existing.dueAt, summary: c.summary,
        outcome: null, closedAt: null, updatedAt: new Date(),
      }).where(eq(s.moderationCases.id, existing.id)).returning();
      return row;
    }
    const [row] = await conn.update(s.moderationCases).set({
      priority: higher(existing.priority, c.priority), reportCount: existing.reportCount + 1,
      dueAt: earlier(existing.dueAt, c.dueAt), updatedAt: new Date(),
    }).where(eq(s.moderationCases.id, existing.id)).returning();
    return row;
  }
  const [row] = await conn.insert(s.moderationCases).values({
    kind: c.kind, targetType: c.targetType, targetId: c.targetId, ownerId: c.ownerId ?? null,
    priority: c.priority, reportId: c.reportId ?? null, reportCount: c.kind === "report" ? 1 : 0,
    dueAt: c.dueAt ?? null, summary: c.summary.slice(0, 300),
  }).returning();
  return row;
}

const RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const higher = (a: Priority, b: Priority) => (RANK[a] <= RANK[b] ? a : b);
const earlier = (a: Date | null, b: Date | null | undefined) => (!a ? (b ?? null) : !b ? a : a < b ? a : b);

/** 案件を閉じ、関係する通報もまとめて同じ結果にする */
export async function closeCase(conn: DB, adminId: string, caseId: string, outcome: string, note: string, reportStatus: s.ReportStatus) {
  const [c] = await conn.select().from(s.moderationCases).where(eq(s.moderationCases.id, caseId));
  if (!c) return null;
  const now = new Date();
  await conn.update(s.moderationCases).set({ status: "closed", outcome, closedAt: now, updatedAt: now, assignedTo: adminId })
    .where(eq(s.moderationCases.id, caseId));
  const open = await conn.update(s.reports).set({ status: reportStatus, resolvedAt: now, updatedAt: now })
    .where(and(eq(s.reports.targetType, c.targetType), eq(s.reports.targetId, c.targetId), inArray(s.reports.status, ["open", "in_progress"])))
    .returning({ id: s.reports.id });
  // 誰が・なぜ閉じたかを、書き換えできない記録に残す
  for (const r of open) {
    await appendChained(conn, s.reportActions, { ticketId: r.id, adminId, action: outcome, note: note || null });
  }
  return { case: c, closed: open.length };
}

/* ===================== 緊急の対応 ===================== */

export const EMERGENCY_ACTIONS = {
  hide_video: "動画を非公開",
  delete_video: "動画を削除",
  suspend_user: "アカウントを停止",
  ban_comments: "コメントを停止",
  ban_posting: "投稿を停止",
  disable_link: "外部リンクを停止",
  hide_all_videos: "この投稿者の動画をすべて非公開",
} as const;
export type EmergencyAction = keyof typeof EMERGENCY_ACTIONS;

/**
 * 管理画面のワンクリック操作。
 * 何をしたかは必ず監査ログに残す。削除しても記録は消えない。
 */
export async function emergencyAction(conn: DB, adminId: string, action: EmergencyAction, targetId: string, reason: string) {
  const r = reason.trim() || "（理由の記入なし）";
  switch (action) {
    case "hide_video":
      await transition(conn, { videoId: targetId, to: "hidden", hiddenReason: "by_admin", statusReason: r, actorId: adminId });
      break;
    case "delete_video":
      await transition(conn, { videoId: targetId, to: "deleted", statusReason: r, actorId: adminId });
      break;
    case "suspend_user":
      await sanction(conn, adminId, targetId, "suspend", r);
      break;
    case "ban_comments":
      await sanction(conn, adminId, targetId, "comment_ban", r);
      break;
    case "ban_posting":
      await sanction(conn, adminId, targetId, "post_ban", r);
      break;
    case "disable_link":
      await conn.update(s.outboundLinks).set({ status: "disabled_by_admin" }).where(eq(s.outboundLinks.id, targetId));
      break;
    case "hide_all_videos": {
      const rows = await conn.select({ id: s.videos.id }).from(s.videos)
        .where(and(eq(s.videos.creatorId, targetId), inArray(s.videos.status, ["published", "approved", "pending_review"])));
      for (const v of rows) await transition(conn, { videoId: v.id, to: "hidden", hiddenReason: "by_admin", statusReason: r, actorId: adminId }).catch(() => {});
      break;
    }
  }
  await audit(conn, adminId, `emergency.${action}`, action.includes("user") || action === "hide_all_videos" || action.startsWith("ban_") ? "user" : action.includes("link") ? "link" : "video", targetId, { reason: r });
  return { ok: true as const, label: EMERGENCY_ACTIONS[action] };
}

/* ===================== 利用者への措置 ===================== */

export const SANCTION_LABEL: Record<SanctionKind, string> = {
  warning: "警告", post_ban: "投稿停止", comment_ban: "コメント停止", suspend: "一時停止", ban: "永久停止", lift: "解除",
};

/**
 * 利用者への措置。投稿者でない人にも使える。
 * 履歴は書き換えできない記録に残し、users 側には「いつまで」だけを持たせて判定を速くする。
 */
export async function sanction(conn: DB, adminId: string, userId: string, kind: SanctionKind, reason: string, days?: number, caseId?: string) {
  const [u] = await conn.select({ id: s.users.id, handle: s.users.handle }).from(s.users).where(eq(s.users.id, userId));
  if (!u) return { ok: false as const, error: "利用者が見つかりません" };
  const endsAt = days && days > 0 ? new Date(Date.now() + days * 86400_000) : null;
  const set: Partial<typeof s.users.$inferInsert> = {};
  switch (kind) {
    case "post_ban": set.postBannedUntil = endsAt ?? new Date("2999-12-31"); break;
    case "comment_ban": set.commentBannedUntil = endsAt ?? new Date("2999-12-31"); break;
    case "suspend": set.status = "suspended"; set.suspendedUntil = endsAt; break;
    case "ban": set.status = "banned"; set.suspendedUntil = null; break;
    case "lift":
      set.status = "active"; set.suspendedUntil = null; set.postBannedUntil = null; set.commentBannedUntil = null;
      break;
    case "warning": break;
  }
  if (Object.keys(set).length) await conn.update(s.users).set(set).where(eq(s.users.id, userId));
  // 停止・BANのときは、ログイン中のセッションも切る
  if (kind === "suspend" || kind === "ban") await conn.delete(s.sessions).where(eq(s.sessions.userId, userId));
  // 投稿者だった場合は投稿者側の状態も合わせる
  if (kind === "ban" || kind === "suspend") {
    await conn.update(s.creatorProfiles).set({ status: kind === "ban" ? "banned" : "suspended", restrictedUntil: endsAt })
      .where(eq(s.creatorProfiles.userId, userId));
  }
  if (kind === "lift") {
    await conn.update(s.creatorProfiles).set({ status: "approved", restrictedUntil: null })
      .where(and(eq(s.creatorProfiles.userId, userId), inArray(s.creatorProfiles.status, ["suspended"])));
  }

  await appendChained(conn, s.userSanctions, { userId, kind, reason: reason.slice(0, 500), endsAt, adminId, caseId: caseId ?? null });
  await notifyUser(conn, {
    userId, kind: `sanction.${kind}`,
    body: kind === "lift" ? "制限を解除しました。" : `${SANCTION_LABEL[kind]}の措置を行いました。理由：${reason}${endsAt ? `（${endsAt.toLocaleDateString("ja-JP")}まで）` : ""}`,
    mailSubject: kind === "lift" ? "【VYBE】制限の解除についてのお知らせ" : "【VYBE】アカウントについての大切なお知らせ",
    mailLead: kind === "lift"
      ? "アカウントにかかっていた制限を解除しました。"
      : "アカウントについて、運営からお知らせがあります。内容と理由、異議申し立ての方法をサイトでご確認ください。",
  });
  await audit(conn, adminId, `sanction.${kind}`, "user", userId, { reason, days: days ?? null });
  return { ok: true as const, handle: u.handle };
}

/** いまこの人にかかっている制限 */
export function activeLimits(u: { status: string; postBannedUntil: Date | null; commentBannedUntil: Date | null; suspendedUntil: Date | null }) {
  const now = Date.now();
  const on = (d: Date | null) => !!d && d.getTime() > now;
  return {
    banned: u.status === "banned",
    suspended: u.status === "suspended" && (u.suspendedUntil === null || on(u.suspendedUntil)),
    postBanned: on(u.postBannedUntil),
    commentBanned: on(u.commentBannedUntil),
  };
}

/** 違反の履歴（本人にも運営にも見せられる形） */
export async function sanctionHistory(userId: string, conn?: DB) {
  const d = conn ?? (await db());
  return d.select({ id: s.userSanctions.id, kind: s.userSanctions.kind, reason: s.userSanctions.reason, endsAt: s.userSanctions.endsAt, createdAt: s.userSanctions.createdAt })
    .from(s.userSanctions).where(eq(s.userSanctions.userId, userId)).orderBy(desc(s.userSanctions.id)).limit(50);
}
