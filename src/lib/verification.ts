import "server-only";
import { and, eq, isNotNull, lt, or } from "drizzle-orm";
import { db, type DB } from "@/db";
import * as s from "@/db/schema";
import type { VerifyMethod } from "@/db/schema";
import { audit } from "./ledger";

/**
 * 投稿者の年齢・本人性の確認。
 *
 * 【方式を1か所に閉じ込める理由】
 * 法令や決済会社の要求はこの先も変わる。方式（self_declared / document_manual / ekyc）を
 * 値として持ち、判定はこのファイルだけで行うことで、要求が変わっても差し替えで済むようにしている。
 *
 * 【プライバシー】
 * 本人確認書類の画像そのものは保存しない。残すのは「確認した」という結果と、
 * 年齢の裏付けに必要な生年月日だけ。生年月日は retentionUntil を過ぎたら消す。
 */

/** いま使う方式。環境変数で切り替えられる（既定は自己申告） */
export function verifyMethod(): VerifyMethod {
  const m = process.env.CREATOR_VERIFY_METHOD;
  return m === "document_manual" || m === "ekyc" ? m : "self_declared";
}

/** 投稿できる最低年齢。法令の確認結果に合わせて変えられるようにしておく */
export const MIN_AGE = Number(process.env.CREATOR_MIN_AGE || 18);
/** 生年月日を保存しておく期間（日）。過ぎたら消し、結果だけ残す */
const RETENTION_DAYS = Number(process.env.VERIFY_RETENTION_DAYS || 365 * 3);

export function ageOn(birth: string, at = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  if (dt > at) return null;
  let age = at.getUTCFullYear() - y;
  const before = at.getUTCMonth() + 1 < mo || (at.getUTCMonth() + 1 === mo && at.getUTCDate() < d);
  if (before) age -= 1;
  return age;
}

export type VerifyResult = { ok: true; status: s.VerifyStatus; age: number } | { ok: false; error: string };

/**
 * 生年月日を受け取って確認を記録する。
 * - self_declared：その場で結果が出る（年齢が足りていれば verified）
 * - それ以外：pending にして、運営または外部サービスの確認を待つ
 */
export async function submitVerification(conn: DB, userId: string, birthDate: string): Promise<VerifyResult> {
  const age = ageOn(birthDate);
  if (age === null) return { ok: false, error: "生年月日が正しくありません" };
  if (age > 120) return { ok: false, error: "生年月日が正しくありません" };
  if (age < MIN_AGE) return { ok: false, error: `${MIN_AGE}歳以上の方のみ投稿者になれます` };

  const method = verifyMethod();
  const now = new Date();
  const status: s.VerifyStatus = method === "self_declared" ? "verified" : "pending";
  const values = {
    userId, method, status, birthDate, isAdult: true,
    verifiedAt: status === "verified" ? now : null,
    verifiedBy: null, rejectedReason: null,
    retentionUntil: new Date(now.getTime() + RETENTION_DAYS * 86400_000),
    updatedAt: now,
  };
  await conn.insert(s.creatorVerifications).values(values)
    .onConflictDoUpdate({ target: s.creatorVerifications.userId, set: values });
  // 投稿者として確認が取れた人は、年齢の状態も「確認済み」にする
  if (status === "verified") await conn.update(s.users).set({ ageStatus: "age_verified" }).where(eq(s.users.id, userId));
  return { ok: true, status, age };
}

/** 運営が目視で確認したとき（method が document_manual / ekyc のとき使う） */
export async function decideVerification(conn: DB, adminId: string, userId: string, approve: boolean, reason?: string) {
  const now = new Date();
  await conn.update(s.creatorVerifications).set({
    status: approve ? "verified" : "rejected",
    verifiedAt: approve ? now : null, verifiedBy: adminId,
    rejectedReason: approve ? null : (reason ?? "確認できませんでした"), updatedAt: now,
  }).where(eq(s.creatorVerifications.userId, userId));
  if (approve) await conn.update(s.users).set({ ageStatus: "age_verified" }).where(eq(s.users.id, userId));
  await audit(conn, adminId, `verification.${approve ? "approve" : "reject"}`, "user", userId, { reason: reason ?? null });
}

/** 投稿してよい状態か（確認が済んでいて、期限が切れていないか） */
export async function canPublish(userId: string, conn?: DB): Promise<{ ok: boolean; reason?: string }> {
  const d = conn ?? (await db());
  const [v] = await d.select().from(s.creatorVerifications).where(eq(s.creatorVerifications.userId, userId));
  if (!v || v.status === "none") return { ok: false, reason: "生年月日の登録が必要です" };
  if (v.status === "pending") return { ok: false, reason: "年齢の確認中です。確認が済むまでお待ちください" };
  if (v.status === "rejected") return { ok: false, reason: v.rejectedReason ?? "年齢の確認が取れませんでした" };
  if (v.status === "expired" || (v.expiresAt && v.expiresAt < new Date())) return { ok: false, reason: "年齢の確認の期限が切れています。もう一度登録してください" };
  if (!v.isAdult) return { ok: false, reason: `${MIN_AGE}歳以上の方のみ投稿できます` };
  return { ok: true };
}

export async function verificationOf(userId: string, conn?: DB) {
  const d = conn ?? (await db());
  const [v] = await d.select().from(s.creatorVerifications).where(eq(s.creatorVerifications.userId, userId));
  return v ?? null;
}

/**
 * 保存期限を過ぎた生年月日を消す（cron の purge から呼ぶ）。
 * 「確認済み」という結果は残すので、運用に支障は出ない。
 */
export async function purgeVerificationData(conn: DB) {
  const now = new Date();
  const rows = await conn.update(s.creatorVerifications)
    .set({ birthDate: null, updatedAt: now })
    .where(and(isNotNull(s.creatorVerifications.birthDate), or(lt(s.creatorVerifications.retentionUntil, now), eq(s.creatorVerifications.status, "rejected"))))
    .returning({ userId: s.creatorVerifications.userId });
  return rows.length;
}
