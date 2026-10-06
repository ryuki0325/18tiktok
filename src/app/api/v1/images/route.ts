import { z } from "zod";
import { fail, json, rateLimit, sameOrigin } from "@/lib/http";
import { currentUser } from "@/lib/auth";
import { maxImages, saveImage } from "@/lib/media";

const Body = z.object({
  dataUrl: z.string().max(10_000_000),
  w: z.number().int().min(1).max(8000),
  h: z.number().int().min(1).max(8000),
});

/** 写真投稿の画像を1枚保存する（端末で縮めたJPEGを受け取る） */
export async function POST(req: Request) {
  if (!(await sameOrigin())) return fail("BAD_ORIGIN", "不正なリクエストです", 403);
  const u = await currentUser();
  if (!u) return fail("UNAUTH", "ログインが必要です", 401);
  // 1時間に送れる枚数の上限（荒らし対策。投稿1回ぶんの上限 × 数回ぶん）
  if (!(await rateLimit(`image:${u.id}`, maxImages() * 5, 3600))) return fail("RATE_LIMITED", "画像の送信が多すぎます。しばらくしてからお試しください", 429);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("INVALID", "画像が正しくありません");
  const r = await saveImage(u.id, p.data.dataUrl, p.data.w, p.data.h);
  if ("error" in r) return fail("INVALID", r.error);
  return json(r);
}
