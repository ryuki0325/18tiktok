"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { comments, creatorProfiles, featuredSlots, notifications, sessions, takedownRequests, users, videos, type Role } from "@/db/schema";
import { adminOrNull, authenticate, createSession, currentUser, isAdminRole, markMfaVerified } from "./auth";
import { clientIpHash, rateLimit } from "./http";
import { audit } from "./ledger";
import { addDomain, penalize, PENALTY_LABEL, removeDomain, resolveReport, reviewVideo } from "./moderation";
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

export async function penaltyAction(form: FormData) {
  const level = str(form, "level") as keyof typeof PENALTY_LABEL;
  const a = await need(level === "ban" || level === "lift" ? ["super_admin"] : level === "suspension" ? ["report_handler"] : ["reviewer", "report_handler"]);
  const reason = str(form, "reason");
  if (!reason || !(level in PENALTY_LABEL)) return;
  await penalize(await db(), a.id, str(form, "id"), level, reason, Number(form.get("days")) || undefined);
  revalidatePath("/admin/creators");
}

/* ---------- 通報 ---------- */
export async function reportAction(form: FormData) {
  const a = await need(["report_handler"]);
  const d = str(form, "decision");
  await resolveReport(await db(), a.id, str(form, "id"), d === "remove" ? "remove" : d === "restore" ? "restore" : "dismiss", str(form, "note"));
  revalidatePath("/admin/reports");
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
  const { linkHealthcheck, purgeExpired } = await import("./jobs");
  const conn = await db();
  const job = str(form, "job");
  if (job === "link-health") await linkHealthcheck(conn);
  if (job === "purge") await purgeExpired(conn);
  await audit(conn, a.id, `job.manual.${job}`, "job", job);
  revalidatePath("/admin/settings");
}

/** 動画の保存先（Bunny Stream）につながるか確かめる */
export async function checkBunnyAction(): Promise<{ ok: boolean; message: string }> {
  await need(["super_admin"]);
  const { checkBunny } = await import("./media");
  return checkBunny();
}
