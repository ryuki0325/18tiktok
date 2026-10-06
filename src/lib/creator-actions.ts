"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { Draft, Post } from "./post-schema";
import { db } from "@/db";
import { affiliateDomains, creatorProfiles, outboundLinks, tags, uploads, videoTags, videos } from "@/db/schema";
import { applyUploadToVideo, dropSource, isUuid, mediaProvider } from "./media";
import { checkTag } from "./tags";
import { transition } from "./video-state";
import { activeLimits } from "./safety";
import { canPublish, submitVerification } from "./verification";
import { checkAffiliateUrl } from "./url";
import { getSetting } from "./settings";
import { currentUser } from "./auth";
import { clientIpHash, rateLimit } from "./http";
import { checkDestinationUrl, createVideo } from "./moderation";
import type { FormState } from "./account-actions";

export async function applyCreatorAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login?next=/creator/apply");
  if (!u.emailVerifiedAt) return { error: "先にメールアドレスの確認をお願いします（マイページから再送できます）" };
  if (form.get("rules") !== "on" || form.get("rights") !== "on" || form.get("sample") !== "on") return { error: "3つの確認事項すべてにチェックしてください" };
  if (!(await rateLimit(`apply:${u.id}`, 5, 86400))) return { error: "申請が多すぎます。しばらくしてからお試しください" };
  const bio = String(form.get("bio") ?? "").trim().slice(0, 300);
  const conn = await db();
  const [cp] = await conn.select().from(creatorProfiles).where(eq(creatorProfiles.userId, u.id));
  if (cp && cp.status !== "rejected") return { error: "すでに申請済みです" };

  // 自分の販売ページ（アフィリエイトURL）を持っていることを、投稿者になる条件にしている。
  // 承認済みの送客先のURLだけを受け付け、短縮URLや転送はここで弾く。
  const chk = await checkDestinationUrl(conn, String(form.get("affiliateUrl") ?? "").trim());
  if (!chk.ok) return { error: chk.error };
  if (chk.link.status !== "active") return { error: "この送客先はまだ使えません。運営の確認が終わるまでお待ちください" };

  // 年齢の確認を先に通す（結果だけを残し、方式は lib/verification.ts に閉じている）
  const v = await submitVerification(conn, u.id, String(form.get("birthDate") ?? ""));
  if (!v.ok) return { error: v.error };
  const link = { destinationId: chk.link.destinationId, affiliateUrl: chk.link.url };
  await conn.insert(creatorProfiles).values({ userId: u.id, bio, status: "pending", ...link })
    .onConflictDoUpdate({ target: creatorProfiles.userId, set: { status: "pending", bio, appliedAt: new Date(), ...link } });
  revalidatePath("/creator/apply");
  return { info: v.status === "verified"
    ? "申請を受け付けました。運営の確認後にお知らせします。"
    : "申請を受け付けました。年齢の確認が済みしだいお知らせします。" };
}

/** フォームの中身を1か所で読む（投稿と下書きで同じものを使う） */
function readPost(form: FormData) {
  return {
    title: form.get("title"), description: form.get("description") ?? "", tags: form.getAll("tags"),
    link: form.get("link") || undefined,
    // 下書きのときは未選択（null）を undefined にして、必須チェックを通さない
    category: form.get("category") ?? undefined, intensity: form.get("intensity") ?? undefined,
    visibility: form.get("visibility") === "private" ? "private" : "public",
    commentsEnabled: form.get("commentsEnabled") !== "off",
  };
}

export async function createVideoAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login?next=/creator/new");
  if (!(await rateLimit(`post:${u.id}`, 20, 86400))) return { error: "1日の投稿上限に達しました" };
  // 停止中の人は投稿できない
  const limits = activeLimits(u);
  if (limits.banned || limits.suspended) return { error: "現在投稿できません" };
  if (limits.postBanned) return { error: "投稿を停止されています" };
  // 年齢の確認が済んでいること
  const vok = await canPublish(u.id);
  if (!vok.ok) return { error: vok.reason! };
  const asDraft = form.get("intent") === "draft";
  const parsed = (asDraft ? Draft : Post).safeParse(readPost(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const draftId = String(form.get("draftId") ?? "") || undefined;
  if (draftId && !isUuid(draftId)) return { error: "下書きが見つかりません" };
  const consents = (["c1", "c2", "c3"] as const).map((k) => form.get(k) === "on") as [boolean, boolean, boolean];
  const conn = await db();
  // 動画ファイル（チャンクアップロード済み）。保存先が設定されている場合は必須
  const uploadId = String(form.get("uploadId") ?? "");
  let upload: typeof uploads.$inferSelect | undefined;
  if (uploadId) {
    if (!isUuid(uploadId)) return { error: "動画ファイルが見つかりません" };
    [upload] = await conn.select().from(uploads).where(and(eq(uploads.id, uploadId), eq(uploads.userId, u.id)));
    if (!upload || upload.videoId) return { error: "動画ファイルが見つかりません。もう一度アップロードしてください" };
    if (upload.status === "uploading") return { error: "動画のアップロードがまだ終わっていません" };
    if (upload.status === "failed") return { error: "動画の変換に失敗しました。別のファイルでお試しください" };
  } else if (mediaProvider()) {
    // 下書きの続きは、動画がもう付いているので選び直さなくてよい
    if (!draftId) return { error: "動画ファイルを選んでください" };
    const [d] = await conn.select({ media: videos.mediaStatus }).from(videos)
      .where(and(eq(videos.id, draftId), eq(videos.creatorId, u.id), eq(videos.status, "draft")));
    if (!d) return { error: "下書きが見つかりません" };
    if (d.media === "none") return { error: "動画ファイルを選んでください" };
  }
  const r = await createVideo(conn, {
    creatorId: u.id,
    ...parsed.data,
    category: (parsed.data.category ?? "women") as "women" | "men" | "couple",
    intensity: parsed.data.intensity || 1,
    consents, ipHash: await clientIpHash(), userAgent: (await headers()).get("user-agent") ?? "",
    asDraft, draftId,
  });
  if (!r.ok) return { error: r.error };
  if (upload) {
    const [linked] = await conn.update(uploads).set({ videoId: r.video.id }).where(eq(uploads.id, upload.id)).returning();
    await applyUploadToVideo(conn, linked);
    // ここから先は切り取り直さないので、元ファイルを消す（保存料の節約）
    await dropSource(linked);
  }
  revalidatePath("/creator/videos");
  redirect(asDraft ? "/creator/videos?saved=1" : `/creator/videos?submitted=1${r.linkPending ? "&linkPending=1" : ""}`);
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
  // 状態は必ず遷移表を通す（審査を飛ばした公開などができないように）
  if (op === "hide") await transition(conn, { videoId: id, to: "hidden", hiddenReason: "by_creator", actorId: u.id, expect: ["published", "approved"] });
  // 運営が下げた動画は投稿者側から戻せない
  if (op === "show" && v.hiddenReason === "by_creator") await transition(conn, { videoId: id, to: "published", actorId: u.id, expect: ["hidden"] });
  if (op === "delete") await transition(conn, { videoId: id, to: "deleted", statusReason: "投稿者が削除", actorId: u.id });
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
  if (!v || v.status === "deleted") return { error: "動画が見つかりません" };
  // 使えないタグはここで断る（作ってから消すのではなく、作らせない）
  const bad = d.tags.map((t) => checkTag(t)).find((c) => !c.ok);
  if (bad && !bad.ok) return { error: bad.error };
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
    // 編集でも新しいタグを作れる（運営が見るまでは候補や検索に出ない）
    const { resolveTags } = await import("./tags");
    const tg = await resolveTags(tx as unknown as typeof conn, d.tags, u.id);
    if (tg.ids.length) await tx.insert(videoTags).values(tg.ids.map((id) => ({ videoId: v.id, tagId: id })));
    if (linkChange === "remove") await tx.delete(outboundLinks).where(eq(outboundLinks.videoId, v.id));
    else if (linkChange) {
      await tx.delete(outboundLinks).where(eq(outboundLinks.videoId, v.id));
      await tx.insert(outboundLinks).values({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 16), videoId: v.id, ...linkChange });
    }
  });
  revalidatePath("/creator/videos");
  redirect(`/creator/videos?edited=1${v.status === "published" && ((linkChange && linkChange !== "remove") || d.intensity > v.intensity) ? "&rereview=1" : ""}`);
}
