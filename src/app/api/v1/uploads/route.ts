import { z } from "zod";
import { db } from "@/db";
import { currentUser } from "@/lib/auth";
import { fail, json, rateLimit, sameOrigin } from "@/lib/http";
import { maxUploadBytes, mediaProvider, startUpload } from "@/lib/media";

const Body = z.object({
  filename: z.string().trim().min(1).max(200),
  mime: z.string().regex(/^video\/[\w.+-]+$/, "動画ファイルを選んでください"),
  size: z.number().int().positive(),
});

/**
 * チャンクアップロードの開始（TikTok の公開APIと同じく「初期化 → 分割して送信 → 完了」の流れ）。
 * 返す tus の送信先にブラウザがファイルを少しずつ送る。途中で切れても HEAD で受け取り済みの位置を聞いて続きから送れる。
 */
export async function POST(req: Request) {
  if (!(await sameOrigin())) return fail("BAD_ORIGIN", "不正なリクエストです", 403);
  const u = await currentUser();
  if (!u) return fail("UNAUTHORIZED", "ログインが必要です", 401);
  if (u.creatorStatus !== "approved") return fail("FORBIDDEN", "投稿者として承認されていません", 403);
  if (!mediaProvider()) return fail("UNAVAILABLE", "動画のアップロードは準備中です", 503);
  if (!(await rateLimit(`upload:${u.id}`, 30, 86400))) return fail("RATE_LIMITED", "1日のアップロード上限に達しました", 429);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("BAD_REQUEST", p.error.issues[0].message);
  if (p.data.size > maxUploadBytes()) return fail("TOO_LARGE", `ファイルが大きすぎます（${Math.round(maxUploadBytes() / 1024 / 1024)}MBまで）`, 413);
  try {
    const { upload, tus } = await startUpload(await db(), u.id, p.data);
    return json({ id: upload.id, provider: upload.provider, tus }, 201);
  } catch (e) {
    console.error("[glow] アップロードを開始できません", e);
    return fail("UPSTREAM", "アップロードを開始できませんでした。しばらくしてからお試しください", 502);
  }
}
