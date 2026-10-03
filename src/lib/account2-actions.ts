"use server";
import { redirect } from "next/navigation";
import { and, eq, gt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { blocks, comments, creatorProfiles, emailTokens, favorites, follows, likes, sessions, userPreferences, users, videos } from "@/db/schema";
import { currentUser, destroySession } from "./auth";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import { clientIpHash, rateLimit } from "./http";
import { absoluteUrl, mailConfigured, sendMail } from "./mail";
import type { FormState } from "./account-actions";

/* ---------- パスワードを忘れた ---------- */
export async function forgotAction(_: FormState, form: FormData): Promise<FormState> {
  if (!(await rateLimit(`forgot:${await clientIpHash()}`, 5, 3600))) return { error: "回数が多すぎます。1時間ほどしてからお試しください" };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return { error: "メールアドレスの形式が正しくありません" };
  const conn = await db();
  const [u] = await conn.select().from(users).where(eq(users.email, email));
  if (u && u.status === "active") {
    const token = randomToken(24);
    await conn.insert(emailTokens).values({ id: sha256(token), userId: u.id, purpose: "reset", expiresAt: new Date(Date.now() + 3600_000) });
    await sendMail({ to: email, subject: "【Glow】パスワードの再設定", text: `次のリンクから新しいパスワードを設定してください（1時間有効）。\n${await absoluteUrl(`/reset-password?token=${token}`)}\n\n心当たりがない場合は、このメールを破棄してください。` });
  }
  // 登録の有無は答えない（他人のメールアドレスが登録されているか調べられないように）
  return { info: mailConfigured() ? "登録があれば、パスワード再設定のメールを送りました。届かない場合は迷惑メールフォルダもご確認ください。" : "メール送信の準備中のため、現在メールでの再設定はできません。お手数ですが運営窓口（運営者情報のページ）までご連絡ください。" };
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const pw = String(form.get("password") ?? "");
  if (pw.length < 10) return { error: "パスワードは10文字以上にしてください" };
  const conn = await db();
  const [t] = await conn.select().from(emailTokens).where(and(eq(emailTokens.id, sha256(token)), eq(emailTokens.purpose, "reset"), gt(emailTokens.expiresAt, new Date())));
  if (!t) return { error: "リンクの期限が切れています。もう一度やり直してください" };
  await conn.update(users).set({ passwordHash: await hashPassword(pw) }).where(eq(users.id, t.userId));
  await conn.delete(emailTokens).where(eq(emailTokens.userId, t.userId));
  await conn.delete(sessions).where(eq(sessions.userId, t.userId)); // ほかの端末のログインも切る
  redirect("/login?reset=1");
}

/* ---------- パスワード変更・退会 ---------- */
export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login");
  const now = String(form.get("current") ?? ""), next = String(form.get("next") ?? "");
  if (next.length < 10) return { error: "新しいパスワードは10文字以上にしてください" };
  if (!(await rateLimit(`chpw:${u.id}`, 5, 900))) return { error: "回数が多すぎます。しばらくしてからお試しください" };
  if (!(await verifyPassword(now, u.passwordHash))) return { error: "今のパスワードが正しくありません" };
  await (await db()).update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, u.id));
  return { info: "パスワードを変更しました。" };
}

/** 退会：ログイン情報と好み・行動の記録を消し、メールとユーザー名は匿名化する（同意記録・監査ログ・通報記録は法令対応のため残る） */
export async function deleteAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (String(form.get("confirm") ?? "").trim() !== "退会する") return { error: "確認のため「退会する」と入力してください" };
  if (!(await verifyPassword(String(form.get("password") ?? ""), u.passwordHash))) return { error: "パスワードが正しくありません" };
  if (u.role !== "user") return { error: "運営アカウントは退会できません" };
  const conn = await db();
  const key = `u:${u.id}`;
  await conn.transaction(async (tx) => {
    await tx.update(videos).set({ status: "removed", statusReason: "退会" }).where(eq(videos.creatorId, u.id));
    await tx.update(comments).set({ status: "removed" }).where(eq(comments.userId, u.id));
    await tx.delete(follows).where(or(eq(follows.followerId, u.id), eq(follows.creatorId, u.id)));
    await tx.delete(likes).where(eq(likes.viewerKey, key));
    await tx.delete(favorites).where(eq(favorites.viewerKey, key));
    await tx.delete(blocks).where(eq(blocks.viewerKey, key));
    await tx.delete(userPreferences).where(eq(userPreferences.userId, u.id));
    await tx.delete(emailTokens).where(eq(emailTokens.userId, u.id));
    await tx.update(creatorProfiles).set({ status: "rejected", bio: "" }).where(eq(creatorProfiles.userId, u.id));
    await tx.update(users).set({
      status: "deleted", email: `deleted+${u.id}@invalid`, handle: `deleted_${u.id.slice(0, 8)}`, displayName: "退会したユーザー",
      passwordHash: await hashPassword(randomToken()), emailVerifiedAt: null, totpSecret: null,
    }).where(eq(users.id, u.id));
    await tx.delete(sessions).where(eq(sessions.userId, u.id));
  });
  await destroySession();
  redirect("/?deleted=1");
}

