"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { comments, creatorProfiles, destinations, featuredSlots, moderationCases, notifications, sessions, takedownRequests, users, videos, type Role } from "@/db/schema";
import { adminOrNull, authenticate, createSession, currentUser, isAdminRole, markMfaVerified } from "./auth";
import { clientIpHash, rateLimit } from "./http";
import { audit } from "./ledger";
import { addDomain, removeDomain, reviewVideo } from "./moderation";
import { closeCase, emergencyAction, restoreTarget, sanction, SANCTION_LABEL, type EmergencyAction } from "./safety";
import { setSetting, type SettingKey } from "./settings";
import { newTotpSecret, otpauthUri, verifyTotp } from "./totp";
import type { FormState } from "./account-actions";

async function need(roles?: Role[]) {
  const a = await adminOrNull(roles);
  if (!a) redirect("/admin?denied=1");
  return a;
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/* ---------- ログイン・2段階認証 ---------- */
export async function adminLoginAction(_: FormState, form: FormData): Promise<FormState> {
  if (!(await rateLimit(`admin-login:${await clientIpHash()}`, 10, 900))) return { error: "試行が多すぎます。15分ほどしてからお試しください" };
  const u = await authenticate(str(form, "email"), String(form.get("password") ?? ""));
  if (!u || !isAdminRole(u.role)) return { error: "メールアドレスまたはパスワードが正しくありません" };
  await createSession(u.id, true);
  redirect("/admin/mfa");
}

export async function totpSetupData() {
  const u = await currentUser();
  if (!u || !isAdminRole(u.role)) redirect("/admin/login");
  if (u.totpEnabled) return null;
  let secret = u.totpSecret;
  if (!secret) {
    secret = newTotpSecret();
    await (await db()).update(users).set({ totpSecret: secret }).where(eq(users.id, u.id));
  }
  const uri = otpauthUri(secret, u.email);
  return { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 200 }) };
}

export async function mfaVerifyAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u || !isAdminRole(u.role)) redirect("/admin/login");
  if (!(await rateLimit(`mfa:${u.id}`, 8, 900))) return { error: "試行が多すぎます。15分ほどしてからお試しください" };
  if (!u.totpSecret || !verifyTotp(u.totpSecret, str(form, "code").replace(/\s/g, ""))) return { error: "コードが正しくありません" };
  const conn = await db();
  if (!u.totpEnabled) await conn.update(users).set({ totpEnabled: true }).where(eq(users.id, u.id));
  await markMfaVerified();
  await audit(conn, u.id, u.totpEnabled ? "admin.login" : "admin.totp_enabled", "user", u.id);
  redirect("/admin");
}

/* ---------- 審査 ---------- */
export async function reviewAction(form: FormData) {
  const a = await need(["reviewer"]);
  const approve = str(form, "decision") === "approve";
  // 差し戻し理由のセレクトは承認時にも送られてくるので、承認のときは使わない
  await reviewVideo(await db(), a.id, str(form, "id"), approve ? "approve" : "reject", approve ? "" : str(form, "note"));
  revalidatePath("/admin/reviews");
}

export async function creatorDecisionAction(form: FormData) {
  const a = await need(["reviewer"]);
  const id = str(form, "id");
  const ok = str(form, "decision") === "approve";
  const conn = await db();
  await conn.update(creatorProfiles).set(ok ? { status: "approved", approvedAt: new Date() } : { status: "rejected" }).where(eq(creatorProfiles.userId, id));
  await conn.insert(notifications).values({ userId: id, kind: ok ? "creator_approved" : "creator_rejected", body: ok ? "投稿者として承認されました。動画を投稿できます。" : `投稿者申請は承認されませんでした。${str(form, "note")}` });
  await audit(conn, a.id, ok ? "creator.approve" : "creator.reject", "user", id, { note: str(form, "note") });
  revalidatePath("/admin/creators");
}

/** 利用者への措置（投稿者でない人にも使える） */
export async function sanctionAction(form: FormData) {
  const kind = str(form, "kind") as keyof typeof SANCTION_LABEL;
  if (!(kind in SANCTION_LABEL)) return;
  // 重い措置ほど強い権限を求める
  const a = await need(kind === "ban" || kind === "lift" ? ["super_admin"] : kind === "suspend" ? ["report_handler"] : ["reviewer", "report_handler"]);
  const reason = str(form, "reason");
  if (!reason) return;
  await sanction(await db(), a.id, str(form, "id"), kind, reason, Number(form.get("days")) || undefined, str(form, "caseId") || undefined);
  revalidatePath("/admin/users");
  revalidatePath("/admin/creators");
  revalidatePath("/admin/cases");
}

/* ---------- 通報・審査キュー ---------- */
/** 案件を閉じる。対象を消す／戻す／却下する */
export async function caseAction(form: FormData) {
  const a = await need(["report_handler"]);
  const conn = await db();
  const caseId = str(form, "id");
  const d = str(form, "decision");
  const note = str(form, "note");
  const [c] = await conn.select().from(moderationCases).where(eq(moderationCases.id, caseId));
  if (!c) return;
  if (d === "remove") {
    if (c.targetType === "video") await emergencyAction(conn, a.id, "delete_video", c.targetId, note || "通報により削除");
    else if (c.targetType === "comment") await conn.update(comments).set({ status: "removed" }).where(eq(comments.id, c.targetId));
    else await emergencyAction(conn, a.id, "hide_all_videos", c.targetId, note || "通報により非公開");
    await closeCase(conn, a.id, caseId, "削除・非公開", note, "resolved_removed");
  } else if (d === "restore") {
    await restoreTarget(conn, c.targetType, c.targetId, a.id);
    await closeCase(conn, a.id, caseId, "問題なしとして復帰", note, "resolved_restored");
  } else {
    await closeCase(conn, a.id, caseId, "却下", note, "dismissed");
  }
  await audit(conn, a.id, `case.${d}`, c.targetType, c.targetId, { caseId, note });
  revalidatePath("/admin/cases");
  revalidatePath("/admin");
}

/** 管理画面のワンクリック操作（緊急対応） */
export async function emergencyActionForm(form: FormData) {
  const action = str(form, "action") as EmergencyAction;
  // 削除と停止は強い権限、非公開は通報担当でもできる
  const heavy = ["delete_video", "suspend_user", "hide_all_videos"].includes(action);
  const a = await need(heavy ? ["super_admin", "report_handler"] : ["reviewer", "report_handler"]);
  const r = await emergencyAction(await db(), a.id, action, str(form, "id"), str(form, "reason"));
  for (const p of ["/admin", "/admin/cases", "/admin/videos", "/admin/users", "/admin/links"]) revalidatePath(p);
  return r;
}

export async function commentModerationAction(form: FormData) {
  const a = await need(["report_handler"]);
  const conn = await db();
  const id = str(form, "id");
  const show = str(form, "decision") === "show";
  await conn.update(comments).set({ status: show ? "visible" : "removed" }).where(eq(comments.id, id));
  await audit(conn, a.id, show ? "comment.show" : "comment.remove", "comment", id);
  revalidatePath("/admin/comments");
}

export async function takedownStatusAction(form: FormData) {
  const a = await need(["report_handler"]);
  const conn = await db();
  const status = str(form, "status") as "investigating" | "actioned" | "answered" | "rejected";
  await conn.update(takedownRequests).set({ status, updatedAt: new Date() }).where(eq(takedownRequests.id, str(form, "id")));
  await audit(conn, a.id, `takedown.${status}`, "takedown", str(form, "id"), { note: str(form, "note") });
  revalidatePath("/admin/takedowns");
}

/* ---------- ドメイン・設定 ---------- */
export async function addDomainAction(form: FormData) {
  const a = await need(["super_admin"]);
  await addDomain(await db(), a.id, str(form, "domain"), str(form, "name"));
  revalidatePath("/admin/domains");
}

export async function removeDomainAction(form: FormData) {
  const a = await need(["super_admin"]);
  await removeDomain(await db(), a.id, Number(form.get("id")));
  revalidatePath("/admin/domains");
}

const NUMERIC: SettingKey[] = ["review.new_creator_full_review_count", "report.auto_hide_threshold.unauthorized_repost", "report.auto_hide_threshold.inappropriate", "report.auto_hide_threshold.other", "comments.auto_hide_threshold", "comments.rate_limit_per_hour", "clicks.dedupe_window_sec", "age_gate.ttl_days"];

export async function settingsAction(form: FormData) {
  const a = await need(["super_admin"]);
  const conn = await db();
  const changed: Record<string, unknown> = {};
  for (const k of NUMERIC) {
    const v = Number(form.get(k));
    if (Number.isFinite(v) && v >= 0) { await setSetting(k, v as never, conn); changed[k] = v; }
  }
  const mode = str(form, "operator.display_mode");
  if (["contact_only", "corporation", "agent"].includes(mode)) { await setSetting("operator.display_mode", mode, conn); changed.mode = mode; }
  await setSetting("operator.contact_email", str(form, "operator.contact_email"), conn);
  await setSetting("operator.name", str(form, "operator.name"), conn);
  const regions = str(form, "geo.blocked_regions").toUpperCase().split(/[\s,、]+/).filter((x) => /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(x));
  await setSetting("geo.blocked_regions", regions, conn);
  const ng = str(form, "ng_words").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 500);
  await setSetting("ng_words", ng, conn);
  await audit(conn, a.id, "settings.update", "site_settings", null, { ...changed, regions, ngCount: ng.length });
  revalidatePath("/admin/settings");
}

export async function bumpAgeGateVersionAction() {
  const a = await need(["super_admin"]);
  const conn = await db();
  const { getSetting } = await import("./settings");
  const v = (await getSetting("age_gate.version", conn)) + 1;
  await setSetting("age_gate.version", v, conn);
  await audit(conn, a.id, "age_gate.version_bump", "site_settings", null, { version: v });
  revalidatePath("/admin/settings");
}

/* ---------- 特集枠 ---------- */
export async function addFeaturedAction(form: FormData) {
  const a = await need(["super_admin"]);
  const conn = await db();
  const videoId = str(form, "videoId");
  const days = Number(form.get("days")) || 7;
  const [v] = await conn.select({ id: videos.id }).from(videos).where(and(eq(videos.id, videoId), eq(videos.status, "published")));
  if (!v) return;
  await conn.insert(featuredSlots).values({ videoId, title: str(form, "title"), position: Number(form.get("position")) || 0, endsAt: new Date(Date.now() + days * 86400_000), createdBy: a.id });
  await audit(conn, a.id, "featured.add", "video", videoId, { days });
  revalidatePath("/admin/featured");
}

export async function removeFeaturedAction(form: FormData) {
  const a = await need(["super_admin"]);
  const conn = await db();
  const id = Number(form.get("id"));
  await conn.delete(featuredSlots).where(eq(featuredSlots.id, id));
  await audit(conn, a.id, "featured.remove", "featured_slot", String(id));
  revalidatePath("/admin/featured");
}

/* ---------- 管理者 ---------- */
export async function setAdminRoleAction(form: FormData) {
  const a = await need(["super_admin"]);
  const conn = await db();
  const role = str(form, "role") as Role;
  if (!["user", "super_admin", "reviewer", "report_handler"].includes(role)) return;
  const email = str(form, "email").toLowerCase();
  const id = str(form, "id");
  const [u] = await conn.select().from(users).where(id ? eq(users.id, id) : eq(users.email, email));
  if (!u || u.id === a.id || u.status !== "active") return; // 自分自身の権限は変えられない
  await conn.update(users).set({ role }).where(eq(users.id, u.id));
  await conn.delete(sessions).where(eq(sessions.userId, u.id)); // 権限が変わったら再ログイン（2段階認証からやり直し）
  await audit(conn, a.id, "admin.set_role", "user", u.id, { role });
  revalidatePath("/admin/admins");
}

/* ---------- 定期処理を今すぐ実行 ---------- */
export async function runJobAction(form: FormData) {
  const a = await need(["super_admin"]);
  const { linkHealthcheck, markJobRun, purgeExpired } = await import("./jobs");
  const conn = await db();
  const job = str(form, "job");
  if (job !== "link-health" && job !== "purge") return;
  if (job === "link-health") await linkHealthcheck(conn);
  else await purgeExpired(conn);
  await markJobRun(job, conn);
  await audit(conn, a.id, `job.manual.${job}`, "job", job);
  revalidatePath("/admin/settings");
}

/** 通知メールが本当に届くか確かめる（Resend の設定もれに気づくため） */
export async function testMailAction(): Promise<{ ok: boolean; message: string }> {
  const a = await need(["super_admin"]);
  const { mailConfigured, sendMail } = await import("./mail");
  if (!mailConfigured()) {
    return { ok: false, message: "メールの設定がありません。MAIL_PROVIDER=resend・RESEND_API_KEY・MAIL_FROM を設定してください（いまは画面のお知らせだけが届きます）" };
  }
  const conn = await db();
  const [me] = await conn.select({ email: users.email }).from(users).where(eq(users.id, a.id));
  if (!me?.email) return { ok: false, message: "自分のメールアドレスが登録されていません" };
  const r = await sendMail({
    to: me.email,
    subject: "VYBE：メール送信のテスト",
    text: "このメールが届いていれば、審査結果や措置のお知らせが利用者に届く状態です。",
  });
  return r.delivered
    ? { ok: true, message: `${me.email} に送りました。迷惑メールに入っていないかもご確認ください` }
    : { ok: false, message: "送れませんでした。RESEND_API_KEY と MAIL_FROM（送信元ドメインの認証）をご確認ください" };
}

/** 動画の保存先（Bunny Stream）につながるか確かめる */
export async function checkBunnyAction(): Promise<{ ok: boolean; message: string }> {
  await need(["super_admin"]);
  const { checkBunny } = await import("./media");
  return checkBunny();
}

/* ---------- 送客先（完全版を見る） ---------- */
/** 投稿者が作ったタグを、広げる／広げないを決める */
export async function tagAction(form: FormData) {
  const a = await need(["super_admin", "reviewer"]);
  const conn = await db();
  const id = Number(str(form, "id"));
  const op = str(form, "op");
  if (!Number.isInteger(id) || (op !== "approve" && op !== "reject")) return;
  const { decideTag } = await import("./tags");
  await decideTag(conn, id, op === "approve");
  await audit(conn, a.id, `tag.${op}`, "tag", String(id), {});
  revalidatePath("/admin/tags");
}

export async function destinationAction(form: FormData) {
  const a = await need(["super_admin"]);
  const conn = await db();
  const op = str(form, "op");
  const id = str(form, "id");
  if (op === "add") {
    const domain = str(form, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const serviceName = str(form, "serviceName");
    if (!domain || !serviceName || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return;
    const [row] = await conn.insert(destinations).values({
      serviceName, domain, affiliateUrl: str(form, "affiliateUrl"), urlPattern: str(form, "urlPattern") || null, status: "pending",
    }).onConflictDoNothing().returning();
    if (row) await audit(conn, a.id, "destination.add", "destination", row.id, { serviceName, domain });
  } else if (op === "approve" || op === "pause" || op === "reject") {
    const status = op === "approve" ? "approved" : op === "pause" ? "paused" : "rejected";
    const [row] = await conn.update(destinations).set({
      status, updatedAt: new Date(), ...(op === "approve" ? { approvedAt: new Date(), approvedBy: a.id } : {}),
    }).where(eq(destinations.id, id)).returning();
    if (row) await audit(conn, a.id, `destination.${op}`, "destination", id, { serviceName: row.serviceName, reason: str(form, "reason") });
  }
  revalidatePath("/admin/links");
}
