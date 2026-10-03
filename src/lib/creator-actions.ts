"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { affiliateDomains, creatorProfiles, outboundLinks, tags, videoTags, videos } from "@/db/schema";
import { checkAffiliateUrl } from "./url";
import { getSetting } from "./settings";
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
  intensity: z.coerce.number().int().min(1, "刺激の強さを選んでください").max(3),
});

export async function createVideoAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login?next=/creator/new");
  if (!(await rateLimit(`post:${u.id}`, 20, 86400))) return { error: "1日の投稿上限に達しました" };
  const parsed = Post.safeParse({ title: form.get("title"), description: form.get("description") ?? "", tags: form.getAll("tags"), link: form.get("link") || undefined, category: form.get("category"), intensity: form.get("intensity") ?? 0 });
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

const Edit = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "タイトルを入力してください").max(60, "タイトルは60文字までです"),
  description: z.string().trim().max(300, "説明は300文字までです"),
  tags: z.array(z.string()).min(1, "タグを1つ以上選んでください").max(5, "タグは5つまでです"),
  link: z.string().trim().max(2048),
  intensity: z.coerce.number().int().min(1).max(3),
});

/** 自分の投稿の編集。タイトル・説明・タグはそのまま反映。外部リンクを変えたときは再審査（差し替え対策） */
export async function updateVideoAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login");
  const parsed = Edit.safeParse({ id: form.get("id"), title: form.get("title"), description: form.get("description") ?? "", tags: form.getAll("tags"), link: form.get("link") ?? "", intensity: form.get("intensity") ?? 1 });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const conn = await db();
  const [v] = await conn.select().from(videos).where(and(eq(videos.id, d.id), eq(videos.creatorId, u.id)));
  if (!v || v.status === "removed") return { error: "動画が見つかりません" };
  const [old] = await conn.select().from(outboundLinks).where(eq(outboundLinks.videoId, v.id));
  let linkChange: null | { url: string; domain: string; status: "active" | "pending_domain_review" } | "remove" = null;
  if ((old?.url ?? "") !== d.link) {
    if (!d.link) linkChange = "remove";
    else {
      const chk = checkAffiliateUrl(d.link, await getSetting("shortener_domains", conn));
      if (!chk.ok) return { error: chk.reason };
      if (chk.url !== old?.url) {
        const [allowed] = await conn.select().from(affiliateDomains).where(and(eq(affiliateDomains.domain, chk.domain), eq(affiliateDomains.isActive, true)));
        linkChange = { url: chk.url, domain: chk.domain, status: allowed ? "active" : "pending_domain_review" };
      }
    }
  }
  await conn.transaction(async (tx) => {
    // リンクの差し替えや、刺激の強さを上げたときは再審査（絞り込みのすり抜け対策）
    const rereview = v.status === "published" && ((linkChange && linkChange !== "remove") || d.intensity > v.intensity);
    await tx.update(videos).set({
      title: d.title, description: d.description, intensity: d.intensity,
      ...(rereview ? { status: "pending_review" as const, statusReason: d.intensity > v.intensity ? "刺激の強さの変更による再審査" : "外部リンクの変更による再審査" } : {}),
    }).where(eq(videos.id, v.id));
    await tx.delete(videoTags).where(eq(videoTags.videoId, v.id));
    const tagRows = await tx.select().from(tags).where(inArray(tags.name, d.tags));
    if (tagRows.length) await tx.insert(videoTags).values(tagRows.map((t) => ({ videoId: v.id, tagId: t.id })));
    if (linkChange === "remove") await tx.delete(outboundLinks).where(eq(outboundLinks.videoId, v.id));
    else if (linkChange) {
      await tx.delete(outboundLinks).where(eq(outboundLinks.videoId, v.id));
      await tx.insert(outboundLinks).values({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 16), videoId: v.id, ...linkChange });
    }
  });
  revalidatePath("/creator/videos");
  redirect(`/creator/videos?edited=1${v.status === "published" && ((linkChange && linkChange !== "remove") || d.intensity > v.intensity) ? "&rereview=1" : ""}`);
}
