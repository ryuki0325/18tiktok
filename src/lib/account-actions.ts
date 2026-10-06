"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { blocks, emailTokens, favorites, likes, notInterested, userPreferences, users } from "@/db/schema";
import { absoluteUrl, sendMail } from "./mail";
import { authenticate, createSession, currentUser, destroySession, DEVICE_COOKIE, isAdminRole, registerUser } from "./auth";
import { randomToken, sha256 } from "./crypto";
import { clientIpHash, rateLimit, rateLimitPeek } from "./http";
import { parsePref } from "./theme";
import { isAudience } from "./audience";
import { THEME_COOKIE } from "./theme-server";

export type FormState = { error?: string; info?: string; devLink?: string } | undefined;

const safeNext = (n: FormDataEntryValue | null) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/me");

/** ログイン前に端末に保存した「いいね・保存」をアカウントへ移し、テーマ設定を同期 */
async function afterLogin(userId: string) {
  const conn = await db();
  const jar = await cookies();
  const vk = jar.get(DEVICE_COOKIE)?.value;
  if (vk) {
    const d = `d:${vk}`, u = `u:${userId}`;
    await conn.execute(sql`insert into favorites (viewer_key, video_id, created_at) select ${u}, video_id, created_at from favorites where viewer_key = ${d} on conflict do nothing`);
    await conn.execute(sql`insert into likes (viewer_key, video_id, created_at) select ${u}, video_id, created_at from likes where viewer_key = ${d} on conflict do nothing`);
    await conn.execute(sql`insert into blocks (viewer_key, creator_id, created_at) select ${u}, creator_id, created_at from blocks where viewer_key = ${d} on conflict do nothing`);
    await conn.execute(sql`insert into not_interested (viewer_key, video_id, created_at) select ${u}, video_id, created_at from not_interested where viewer_key = ${d} on conflict do nothing`);
    await conn.delete(notInterested).where(eq(notInterested.viewerKey, d));
    await conn.delete(blocks).where(eq(blocks.viewerKey, d));
    await conn.delete(favorites).where(eq(favorites.viewerKey, d));
    await conn.delete(likes).where(eq(likes.viewerKey, d));
  }
  const [p] = await conn.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  const opts = { sameSite: "lax" as const, path: "/", maxAge: 400 * 86400, secure: process.env.NODE_ENV === "production" };
  if (p) jar.set(THEME_COOKIE, JSON.stringify(parsePref(p.theme)), opts);
  else {
    const cookiePref = parsePref(jar.get(THEME_COOKIE)?.value ?? null);
    let tags: string[] = [];
    try { tags = JSON.parse(decodeURIComponent(jar.get("ptags")?.value ?? "[]")); } catch {}
    const aud = jar.get("aud")?.value;
    await conn.insert(userPreferences).values({ userId, theme: cookiePref, preferredTags: tags, audience: isAudience(aud) ? aud : "all", maxIntensity: [1, 2, 3].includes(Number(jar.get("mi")?.value)) ? Number(jar.get("mi")?.value) : 3 }).onConflictDoNothing();
  }
}

async function issueVerifyLink(userId: string) {
  const token = randomToken(24);
  await (await db()).insert(emailTokens).values({ id: sha256(token), userId, purpose: "verify", expiresAt: new Date(Date.now() + 24 * 3600_000) });
  const link = `/verify-email?token=${token}`;
  const [u] = await (await db()).select({ email: users.email }).from(users).where(eq(users.id, userId));
  const { delivered } = await sendMail({ to: u.email, subject: "【VYBE】メールアドレスの確認", text: `次のリンクを開いて、メールアドレスの確認を完了してください（24時間有効）。\n${await absoluteUrl(link)}\n\n心当たりがない場合は、このメールを破棄してください。` });
  // メールが送れない間は、登録した本人の画面に確認リンクを表示する（登録直後・ログイン中の本人だけが見る画面）
  return delivered ? null : link;
}

const Signup = z.object({
  email: z.string().email("メールアドレスの形式が正しくありません").max(254),
  password: z.string().min(10, "パスワードは10文字以上にしてください").max(200),
  handle: z.string().regex(/^[a-z0-9_.]{3,20}$/i, "ユーザー名は半角英数字と _ . で3〜20文字です"),
  adult: z.literal("on", { message: "18歳以上であることの確認が必要です" }),
  terms: z.literal("on", { message: "利用規約への同意が必要です" }),
});

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  if (!(await rateLimit(`signup:${await clientIpHash()}`, 5, 3600))) return { error: "登録の回数が多すぎます。1時間ほどしてからお試しください" };
  const parsed = Signup.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = await registerUser(parsed.data);
  if (!r.ok) return { error: r.error };
  await createSession(r.user.id, false);
  await afterLogin(r.user.id);
  const link = await issueVerifyLink(r.user.id);
  return { info: "登録しました。メールアドレスの確認をお願いします。", devLink: link ?? undefined };
}

/**
 * 同じ回線からのログイン試行の上限（15分あたり）。
 * 自動テストは1つの回線から何度もログインするため、そこだけ環境変数で上げる。
 */
const LOGIN_MAX_PER_IP = Number(process.env.LOGIN_MAX_PER_IP || 20);
/**
 * 同じアカウントに対して、続けて失敗してよい回数（15分あたり）。
 * 数えるのは「失敗」だけ。成功まで数えると、端末をいくつも使う本人が締め出されてしまう。
 * 総当たりはすべて失敗なので、守りの強さは変わらない。
 */
const LOGIN_MAX_FAILS = 8;

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const acct = `login-acct:${email.toLowerCase()}`;
  if (!(await rateLimit(`login:${await clientIpHash()}`, LOGIN_MAX_PER_IP, 900)) || !(await rateLimitPeek(acct, LOGIN_MAX_FAILS, 900)))
    return { error: "ログインの試行が多すぎます。15分ほどしてからお試しください" };
  const u = await authenticate(email, String(form.get("password") ?? ""));
  if (!u) {
    await rateLimit(acct, LOGIN_MAX_FAILS, 900); // 失敗したときだけ数える
    return { error: "メールアドレスまたはパスワードが正しくありません" };
  }
  await createSession(u.id, isAdminRole(u.role));
  await afterLogin(u.id);
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function resendVerifyAction(): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!(await rateLimit(`verify:${u.id}`, 3, 3600))) return { error: "しばらくしてからお試しください" };
  const link = await issueVerifyLink(u.id);
  return { info: "確認メールを送りました。", devLink: link ?? undefined };
}

export async function verifyEmailToken(token: string) {
  const conn = await db();
  const [t] = await conn.select().from(emailTokens).where(and(eq(emailTokens.id, sha256(token)), gt(emailTokens.expiresAt, new Date())));
  if (!t) return false;
  await conn.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, t.userId));
  await conn.delete(emailTokens).where(eq(emailTokens.id, t.id));
  return true;
}
