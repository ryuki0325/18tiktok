"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { creatorProfiles, outboundLinks, videos } from "@/db/schema";
import { currentUser } from "./auth";
import { clientIpHash, rateLimit } from "./http";
import { createVideo } from "./moderation";
import type { FormState } from "./account-actions";

export async function applyCreatorAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login?next=/creator/apply");
  if (!u.emailVerifiedAt) return { error: "先にメールアドレスの確認をお願いします（マイページから再送できます）" };
  if (form.get("adult") !== "on" || form.get("rules") !== "on") return { error: "2つの確認事項にチェックしてください" };
  const bio = String(form.get("bio") ?? "").trim().slice(0, 300);
  const conn = await db();
  const [cp] = await conn.select().from(creatorProfiles).where(eq(creatorProfiles.userId, u.id));
  if (cp && cp.status !== "rejected") return { error: "すでに申請済みです" };
  await conn.insert(creatorProfiles).values({ userId: u.id, bio, status: "pending" })
    .onConflictDoUpdate({ target: creatorProfiles.userId, set: { status: "pending", bio, appliedAt: new Date() } });
  revalidatePath("/creator/apply");
  return { info: "申請を受け付けました。運営の確認後にお知らせします。" };
}

const Post = z.object({
  title: z.string().trim().min(1, "タイトルを入力してください").max(60, "タイトルは60文字までです"),
  description: z.string().trim().max(300, "説明は300文字までです"),
  tags: z.array(z.string()).min(1, "タグを1つ以上選んでください").max(5, "タグは5つまでです"),
  link: z.string().trim().max(2048).optional(),
  category: z.enum(["women", "men", "couple"], { message: "ジャンル（出演者）を選んでください" }),
});

export async function createVideoAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login?next=/creator/new");
  if (!(await rateLimit(`post:${u.id}`, 20, 86400))) return { error: "1日の投稿上限に達しました" };
  const parsed = Post.safeParse({ title: form.get("title"), description: form.get("description") ?? "", tags: form.getAll("tags"), link: form.get("link") || undefined, category: form.get("category") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const consents = (["c1", "c2", "c3"] as const).map((k) => form.get(k) === "on") as [boolean, boolean, boolean];
  const r = await createVideo(await db(), {
    creatorId: u.id, ...parsed.data, consents, ipHash: await clientIpHash(), userAgent: (await headers()).get("user-agent") ?? "",
  });
  if (!r.ok) return { error: r.error };
  redirect(`/creator/videos?submitted=1${r.linkPending ? "&linkPending=1" : ""}`);
}

/** 投稿者自身による非公開・再公開・削除（いつでも可能） */
export async function myVideoAction(form: FormData) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const id = String(form.get("id"));
  const op = String(form.get("op"));
  const conn = await db();
  const [v] = await conn.select().from(videos).where(and(eq(videos.id, id), eq(videos.creatorId, u.id)));
  if (!v) return;
  if (op === "hide" && v.status === "published") await conn.update(videos).set({ status: "hidden_by_creator" }).where(eq(videos.id, id));
  if (op === "show" && v.status === "hidden_by_creator") await conn.update(videos).set({ status: "published" }).where(eq(videos.id, id));
  if (op === "delete") {
    await conn.update(videos).set({ status: "removed", statusReason: "投稿者が削除" }).where(eq(videos.id, id));
    await conn.update(outboundLinks).set({ status: "disabled_by_admin" }).where(eq(outboundLinks.videoId, id));
  }
  if (op === "comments") await conn.update(videos).set({ commentsEnabled: !v.commentsEnabled }).where(eq(videos.id, id));
  revalidatePath("/creator/videos");
}
