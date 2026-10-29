"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { Draft, Post } from "./post-schema";
import { db } from "@/db";
import { creatorProfiles, tags, uploads, videoTags, videos } from "@/db/schema";
import { applyUploadToVideo, dropSource, isUuid } from "./media";
import { checkTag } from "./tags";
import { transition } from "./video-state";
import { activeLimits } from "./safety";
import { canPublish, submitVerification } from "./verification";
import { currentUser } from "./auth";
import { clientIpHash, rateLimit } from "./http";
import { createVideo } from "./moderation";
import { ATTEST_KEYS, addAffiliate, recordAttestation } from "./affiliates";
import type { FormState } from "./account-actions";

/**
 * 投稿者の登録。運営の承認は置かず、登録できたらすぐ投稿できる。
 *
 * そのかわり入口で次を満たしてもらう：
 *  - 生年月日（18歳以上）
 *  - 承認済みのサービスのアフィリエイトID（1つ以上。ほかの人が登録済みのIDは使えない）
 *  - 確認事項すべてへの同意（内容と版を、書き換えられない形で記録する）
 */
export async function applyCreatorAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login?next=/creator/apply");
  // メールアドレスの確認は投稿の条件にしない（あとで確認してもらう。通知メールは確認済みの人にだけ届く）
  if (!(await rateLimit(`apply:${u.id}`, 5, 86400))) return { error: "やり直しが多すぎます。しばらくしてからお試しください" };

  // 確認事項は1つでも欠けたら進めない
  const checked = ATTEST_KEYS.filter((k) => form.get(`at.${k}`) === "on");
  if (checked.length !== ATTEST_KEYS.length) return { error: "確認事項すべてにチェックしてください" };

  const conn = await db();
  const [cp] = await conn.select().from(creatorProfiles).where(eq(creatorProfiles.userId, u.id));
  if (cp && cp.status === "approved") return { error: "すでに登録されています" };
  if (cp && (cp.status === "suspended" || cp.status === "banned")) return { error: "現在このアカウントでは登録できません" };

  // アフィリエイト（サービス＋ID）。画面からは複数行が送られてくる
  const dests = form.getAll("destinationId").map(String);
  const ids = form.getAll("affiliateId").map(String);
  const pairs = dests.map((d, i) => ({ destinationId: d, affiliateId: ids[i] ?? "" }))
    .filter((p) => p.destinationId && p.affiliateId.trim());
  if (!pairs.length) return { error: "アフィリエイトのサービスとIDを1つ以上入力してください" };

  // 年齢の確認を先に通す（結果だけを残し、方式は lib/verification.ts に閉じている）
  const v = await submitVerification(conn, u.id, String(form.get("birthDate") ?? ""));
  if (!v.ok) return { error: v.error };

  for (const p of pairs) {
    const r = await addAffiliate(conn, u.id, p.destinationId, p.affiliateId);
    if (!r.ok) return { error: r.error };
  }

  // 同意の内容を、書き換えられない形で残す
  await recordAttestation(conn, u.id, checked, await clientIpHash(), (await headers()).get("user-agent") ?? "");

  // 運営の承認は置かない。年齢の確認が済んでいればそのまま投稿できる
  const status = v.status === "verified" ? "approved" : "pending";
  await conn.insert(creatorProfiles).values({ userId: u.id, status, approvedAt: status === "approved" ? new Date() : null })
    .onConflictDoUpdate({ target: creatorProfiles.userId, set: { status, appliedAt: new Date(), approvedAt: status === "approved" ? new Date() : null } });
  revalidatePath("/creator/apply");
  revalidatePath("/creator/new");
  if (status === "approved") redirect("/creator/new");
  return { info: "年齢の確認が済みしだい投稿できるようになります。" };
}

/** 設定画面から、アフィリエイトを1つ足す（登録済みのものは変えられない） */
export async function addAffiliateAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login?next=/settings/affiliates");
  if (!(await rateLimit(`aff:${u.id}`, 10, 86400))) return { error: "追加が多すぎます。しばらくしてからお試しください" };
  const conn = await db();
  const r = await addAffiliate(conn, u.id, String(form.get("destinationId") ?? ""), String(form.get("affiliateId") ?? ""));
  if (!r.ok) return { error: r.error };
  revalidatePath("/settings/affiliates");
  revalidatePath("/creator/new");
  return { info: "追加しました。" };
}

/** フォームの中身を1か所で読む（投稿と下書きで同じものを使う） */
function readPost(form: FormData) {
  return {
    title: form.get("title"), description: form.get("description") ?? "", tags: form.getAll("tags"),
    link: form.get("link") || undefined,
    embed: form.get("embed") || undefined,
    embedFit: form.get("embedFit") === "cover" ? "cover" : "contain",
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

  // 写真投稿：保存済みの画像URLを受け取る（サーバーに保存された自分のものだけ）
  const kind = form.get("kind") === "photo" ? "photo" : "video";
  let images: { url: string; w: number; h: number }[] | undefined;
  if (kind === "photo") {
    try {
      const raw = JSON.parse(String(form.get("images") ?? "[]")) as { url: string; w: number; h: number }[];
      const { isOwnImageUrl } = await import("./media");
      const ok = Array.isArray(raw) && raw.every((x) => isOwnImageUrl(u.id, x.url)
        && Number.isInteger(x.w) && Number.isInteger(x.h));
      if (!ok) return { error: "画像が正しくありません。選び直してください" };
      images = raw;
    } catch { return { error: "画像が正しくありません。選び直してください" }; }
    if (!asDraft && !images.length) return { error: "画像を1枚以上選んでください" };
    const { maxImages } = await import("./media");
    if (images.length > maxImages()) return { error: `画像は${maxImages()}枚までです` };
  }

  // 動画は2通り：
  //  - 自社アップロード（uploadId）：権利を持つ動画ファイルを自社に保存して配信（再生操作が自前でできる）。
  //  - 埋め込み（embed）：公式サンプル等を提携先の公式サーバーから再生する。
  let embed: { embedUrl: string; embedDomain: string } | undefined;
  let upload: typeof uploads.$inferSelect | undefined;
  if (kind === "video") {
    const uploadId = String(form.get("uploadId") ?? "");
    const raw = parsed.data.embed?.trim();
    if (uploadId) {
      // 自分の・まだ投稿に紐づいていないアップロードだけを受け付ける
      if (!isUuid(uploadId)) return { error: "動画ファイルが見つかりません" };
      [upload] = await conn.select().from(uploads).where(and(eq(uploads.id, uploadId), eq(uploads.userId, u.id)));
      if (!upload || upload.videoId) return { error: "動画ファイルが見つかりません。もう一度アップロードしてください" };
      if (upload.status === "uploading") return { error: "動画のアップロードがまだ終わっていません" };
      if (upload.status === "failed") return { error: "動画の変換に失敗しました。別のファイルでお試しください" };
    } else if (raw) {
      const { checkEmbedUrl } = await import("./embeds");
      const chk = await checkEmbedUrl(conn, raw);
      if (!chk.ok) return { error: chk.error };
      embed = { embedUrl: chk.embedUrl, embedDomain: chk.embedDomain };
    } else if (!asDraft) {
      // 下書きの続きで、すでに動画（アップロード or 埋め込み）が付いているならそれを使う
      const [d] = draftId
        ? await conn.select({ embedUrl: videos.embedUrl, media: videos.mediaStatus }).from(videos)
          .where(and(eq(videos.id, draftId), eq(videos.creatorId, u.id), eq(videos.status, "draft")))
        : [undefined];
      if (!d || (!d.embedUrl && d.media === "none")) return { error: "動画ファイルを選ぶか、埋め込みURLを入れてください" };
    }
  }
  const r = await createVideo(conn, {
    creatorId: u.id,
    ...parsed.data,
    category: (parsed.data.category ?? "women") as "women" | "men" | "gay" | "lesbian",
    intensity: parsed.data.intensity || 1,
    consents, ipHash: await clientIpHash(), userAgent: (await headers()).get("user-agent") ?? "",
    asDraft, draftId, kind, images, embedUrl: embed?.embedUrl, embedDomain: embed?.embedDomain, embedFit: parsed.data.embedFit,
  });
  if (!r.ok) return { error: r.error };
  if (upload) {
    // アップロードを投稿に紐づけ、動画の行に「場所」（再生URL等）を写す。
    const [linked] = await conn.update(uploads).set({ videoId: r.video.id }).where(eq(uploads.id, upload.id)).returning();
    await applyUploadToVideo(conn, linked);
    // 変換が終わっていれば元ファイルを消す（保存料の節約）。
    // まだ変換中(processing)なら消さない——変換は元ファイルを読み続けており、消すと残りの画質が壊れる。
    // その場合は変換の完了時（transcodeLocal の最後）に元ファイルを片付ける。
    if (linked.status === "ready") await dropSource(linked);
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
  visibility: z.enum(["public", "private"]).default("public"),
  commentsEnabled: z.coerce.boolean().default(true),
  embedFit: z.enum(["cover", "contain"]).default("cover"),
});

/**
 * 自分の投稿の編集。
 * 変えられるのは、タイトル・説明（#タグ）・公開範囲・コメント許可だけ。
 * 埋め込み動画とアフィリエイトURL（完全版リンク）は変えられない（差し替え対策）。
 * 変えたいときは、新しく投稿し直してもらう。
 */
export async function updateVideoAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login");
  const parsed = Edit.safeParse({
    id: form.get("id"), title: form.get("title"), description: form.get("description") ?? "",
    visibility: form.get("visibility") === "private" ? "private" : "public",
    commentsEnabled: form.get("commentsEnabled") !== "off",
    embedFit: form.get("embedFit") === "contain" ? "contain" : "cover",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const conn = await db();
  const [v] = await conn.select().from(videos).where(and(eq(videos.id, d.id), eq(videos.creatorId, u.id)));
  if (!v || v.status === "deleted") return { error: "動画が見つかりません" };
  // タグは説明文の #ハッシュタグ から拾う（投稿画面と同じ）
  const tagsFromCaption = Array.from(new Set((d.description.match(/#([^\s#、。,.!?！？]+)/g) ?? []).map((t) => t.slice(1)).filter(Boolean))).slice(0, 5);
  const bad = tagsFromCaption.map((t) => checkTag(t)).find((c) => !c.ok);
  if (bad && !bad.ok) return { error: bad.error };
  await conn.transaction(async (tx) => {
    await tx.update(videos).set({ title: d.title, description: d.description, visibility: d.visibility, commentsEnabled: d.commentsEnabled, embedFit: d.embedFit }).where(eq(videos.id, v.id));
    await tx.delete(videoTags).where(eq(videoTags.videoId, v.id));
    const { resolveTags } = await import("./tags");
    const tg = tagsFromCaption.length ? await resolveTags(tx as unknown as typeof conn, tagsFromCaption, u.id) : { ids: [] as number[] };
    if (tg.ids.length) await tx.insert(videoTags).values(tg.ids.map((id) => ({ videoId: v.id, tagId: id })));
  });
  // 公開範囲の切り替えは、状態遷移表を通す（審査飛ばし対策）
  if (d.visibility === "private" && (v.status === "published" || v.status === "approved")) {
    await transition(conn, { videoId: v.id, to: "hidden", hiddenReason: "by_creator", actorId: u.id, expect: ["published", "approved"] });
  } else if (d.visibility === "public" && v.status === "hidden" && v.hiddenReason === "by_creator") {
    await transition(conn, { videoId: v.id, to: "published", actorId: u.id, expect: ["hidden"] });
  }
  revalidatePath("/creator/videos");
  redirect("/creator/videos?edited=1");
}
