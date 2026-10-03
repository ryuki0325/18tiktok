"use server";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { currentUser } from "./auth";
import { rateLimit } from "./http";
import type { FormState } from "./account-actions";

/** プロフィール写真：128×128 まで縮めた JPEG の data URL（約10KBまで） */
const AVATAR = z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(60_000);

const Profile = z.object({
  handle: z.string().trim().toLowerCase()
    .min(3, "ユーザー名は3文字以上です").max(20, "ユーザー名は20文字までです")
    .regex(/^[a-z0-9._]+$/, "ユーザー名は半角の英小文字・数字・ . _ だけ使えます")
    .refine((v) => !/^[._]|[._]$|[._]{2}/.test(v), "ユーザー名の先頭・末尾や連続した . _ は使えません"),
  displayName: z.string().trim().min(1, "表示名を入力してください").max(30, "表示名は30文字までです"),
  bio: z.string().trim().max(160, "自己紹介は160文字までです"),
  avatarHue: z.coerce.number().int().min(0).max(359),
});

/** 使えないユーザー名（なりすまし・紛らわしいもの） */
const RESERVED = ["admin", "administrator", "root", "support", "help", "official", "staff", "vybe", "운영", "運営", "undefined", "null", "me", "settings", "login", "signup", "search", "explore", "api"];

export async function updateProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) return { error: "ログインが必要です" };
  if (!(await rateLimit(`profile:${u.id}`, 20, 3600))) return { error: "変更が多すぎます。しばらくしてからお試しください" };
  const parsed = Profile.safeParse({
    handle: form.get("handle"), displayName: form.get("displayName"), bio: form.get("bio") ?? "", avatarHue: form.get("avatarHue") ?? u.avatarHue,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { handle, displayName, bio, avatarHue } = parsed.data;
  if (handle !== u.handle && RESERVED.includes(handle)) return { error: "このユーザー名は使えません" };

  const raw = String(form.get("avatar") ?? "");
  let avatarUrl = u.avatarUrl;
  if (raw === "remove") avatarUrl = null;
  else if (raw.startsWith("data:")) {
    const a = AVATAR.safeParse(raw);
    if (!a.success) return { error: "写真を読み込めませんでした。別の画像でお試しください" };
    avatarUrl = a.data;
  }

  const conn = await db();
  if (handle !== u.handle) {
    const [taken] = await conn.select({ id: users.id }).from(users).where(and(sql`lower(${users.handle}) = ${handle}`, ne(users.id, u.id)));
    if (taken) return { error: "このユーザー名はすでに使われています" };
  }
  await conn.update(users).set({ handle, displayName, bio, avatarHue, avatarUrl }).where(eq(users.id, u.id));
  revalidatePath("/me");
  revalidatePath(`/u/${handle}`);
  return { info: "プロフィールを保存しました" };
}
