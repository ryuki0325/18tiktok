"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { collections, videos } from "@/db/schema";
import { currentUser } from "./auth";
import { clearWatchHistory } from "./history";
import type { FormState } from "./account-actions";

import { MAX_PINNED } from "./collections";

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** 自分の投稿をプロフィール上部に固定／解除する */
export async function pinVideoAction(form: FormData) {
  const u = await currentUser();
  if (!u) return;
  const id = String(form.get("id") ?? "");
  const pin = form.get("op") === "pin";
  if (!isUuid(id)) return;
  const conn = await db();
  const [v] = await conn.select({ id: videos.id, status: videos.status }).from(videos)
    .where(and(eq(videos.id, id), eq(videos.creatorId, u.id)));
  if (!v) return;
  if (pin) {
    // 公開中の動画だけ固定できる。上限を超えないように確認する
    if (v.status !== "published") return;
    const [{ n }] = await conn.select({ n: sql<number>`count(*)::int` }).from(videos)
      .where(and(eq(videos.creatorId, u.id), sql`${videos.pinnedAt} is not null`));
    if (n >= MAX_PINNED) return;
    await conn.update(videos).set({ pinnedAt: new Date() }).where(eq(videos.id, id));
  } else {
    await conn.update(videos).set({ pinnedAt: null }).where(eq(videos.id, id));
  }
  revalidatePath("/creator/videos");
  revalidatePath("/me");
}

/** 視聴履歴をすべて消す */
export async function clearHistoryAction() {
  const u = await currentUser();
  if (!u) return;
  await clearWatchHistory(await db(), u.id);
  revalidatePath("/history");
}

/* ---------------- 保存のコレクション（フォルダ） ---------------- */

export async function createCollectionAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) return { error: "ログインが必要です" };
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  if (!name) return { error: "名前を入力してください" };
  const conn = await db();
  const [{ n }] = await conn.select({ n: sql<number>`count(*)::int` }).from(collections).where(eq(collections.userId, u.id));
  if (n >= 50) return { error: "コレクションが多すぎます（50個まで）" };
  await conn.insert(collections).values({ userId: u.id, name });
  revalidatePath("/collections");
  return { info: "作成しました" };
}

export async function renameCollectionAction(form: FormData) {
  const u = await currentUser();
  if (!u) return;
  const id = String(form.get("id") ?? ""); const name = String(form.get("name") ?? "").trim().slice(0, 40);
  if (!isUuid(id) || !name) return;
  const conn = await db();
  await conn.update(collections).set({ name }).where(and(eq(collections.id, id), eq(collections.userId, u.id)));
  revalidatePath("/collections");
}

export async function deleteCollectionAction(form: FormData) {
  const u = await currentUser();
  if (!u) return;
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const conn = await db();
  await conn.delete(collections).where(and(eq(collections.id, id), eq(collections.userId, u.id)));
  revalidatePath("/collections");
}

