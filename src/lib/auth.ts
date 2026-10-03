import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { ageGateSessions, creatorProfiles, sessions, users, type Role } from "@/db/schema";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import { AG_COOKIE, readAgToken } from "./agegate-token";
import { getSetting } from "./settings";

export const SID_COOKIE = "sid";
export const DEVICE_COOKIE = "vk";
const SESSION_DAYS = 30;
const ADMIN_SESSION_HOURS = 8;

export type CurrentUser = typeof users.$inferSelect & { mfaVerified: boolean; creatorStatus: string | null };

const cookieBase = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

/* ---------- セッション ---------- */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SID_COOKIE)?.value;
  if (!token) return null;
  const conn = await db();
  const [row] = await conn
    .select({ u: users, s: sessions, c: creatorProfiles.status })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())));
  if (!row || row.u.status === "banned" || row.u.status === "deleted") return null;
  return { ...row.u, mfaVerified: row.s.mfaVerified, creatorStatus: row.c ?? null };
});

export async function createSession(userId: string, isAdmin: boolean) {
  const token = randomToken();
  const conn = await db();
  const ms = isAdmin ? ADMIN_SESSION_HOURS * 3600_000 : SESSION_DAYS * 86400_000;
  await conn.insert(sessions).values({ id: sha256(token), userId, expiresAt: new Date(Date.now() + ms) });
  (await cookies()).set(SID_COOKIE, token, { ...cookieBase, maxAge: ms / 1000 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SID_COOKIE)?.value;
  if (token) await (await db()).delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(SID_COOKIE);
}

export async function markMfaVerified() {
  const token = (await cookies()).get(SID_COOKIE)?.value;
  if (token) await (await db()).update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, sha256(token)));
}

/* ---------- 登録・ログイン ---------- */
export async function registerUser(input: { email: string; password: string; handle: string }) {
  const conn = await db();
  const email = input.email.trim().toLowerCase();
  const handle = input.handle.trim().toLowerCase();
  const exists = await conn.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists.length) return { ok: false as const, error: "このメールアドレスはすでに登録されています" };
  const taken = await conn.select({ id: users.id }).from(users).where(eq(users.handle, handle));
  if (taken.length) return { ok: false as const, error: "このユーザー名はすでに使われています" };
  const [u] = await conn.insert(users).values({
    email, handle, displayName: handle, passwordHash: await hashPassword(input.password), avatarHue: Math.floor(Math.random() * 360),
  }).returning();
  return { ok: true as const, user: u };
}

export async function authenticate(emailRaw: string, password: string) {
  const conn = await db();
  const [u] = await conn.select().from(users).where(eq(users.email, emailRaw.trim().toLowerCase()));
  // 存在しない場合も同じ時間をかける（ユーザー列挙対策）
  const ok = u ? await verifyPassword(password, u.passwordHash) : (await hashPassword(password), false);
  if (!u || !ok) return null;
  if (u.status === "banned" || u.status === "deleted") return null;
  return u;
}

/* ---------- ガード ---------- */
export const isAdminRole = (r: Role) => r !== "user";

export async function requireUser(next = "/") {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export async function requireAdmin(roles?: Role[]) {
  const u = await currentUser();
  if (!u || !isAdminRole(u.role)) redirect("/admin/login");
  if (!u.mfaVerified) redirect("/admin/mfa");
  if (roles && u.role !== "super_admin" && !roles.includes(u.role)) redirect("/admin?denied=1");
  return u;
}

/** APIで使う：管理者でなければ null */
export async function adminOrNull(roles?: Role[]) {
  const u = await currentUser();
  if (!u || !isAdminRole(u.role) || !u.mfaVerified) return null;
  if (roles && u.role !== "super_admin" && !roles.includes(u.role)) return null;
  return u;
}

/* ---------- 年齢確認（サーバー側の判定） ---------- */
export const ageGateOk = cache(async (): Promise<boolean> => {
  const t = readAgToken((await cookies()).get(AG_COOKIE)?.value);
  if (!t) return false;
  const conn = await db();
  const version = await getSetting("age_gate.version", conn);
  const [row] = await conn.select().from(ageGateSessions).where(eq(ageGateSessions.id, t.sessionId));
  return !!row && row.expiresAt > new Date() && row.gateVersion >= version;
});

export async function requireAgeGate(next: string) {
  if (!(await ageGateOk())) redirect(`/age-gate?next=${encodeURIComponent(next)}`);
}

/* ---------- 地域ポリシー ---------- */
export async function regionBlocked(): Promise<boolean> {
  const h = await headers();
  const country = (h.get("cf-ipcountry") || h.get("x-vercel-ip-country") || "").toUpperCase();
  const region = (h.get("x-vercel-ip-country-region") || "").toUpperCase();
  if (!country) return false;
  const blocked = await getSetting("geo.blocked_regions");
  return blocked.includes(country) || (!!region && blocked.includes(`${country}-${region}`));
}

/* ---------- 閲覧者キー（いいね・保存・通報の重複防止） ---------- */
export async function viewerKey(): Promise<string> {
  const u = await currentUser();
  if (u) return `u:${u.id}`;
  const d = (await cookies()).get(DEVICE_COOKIE)?.value;
  return `d:${d && /^[A-Za-z0-9_-]{16,64}$/.test(d) ? d : "anon"}`;
}
