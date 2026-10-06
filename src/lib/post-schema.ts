import { z } from "zod";

/**
 * 投稿の入力の決まり。
 * サーバー側の判定に使うので、画面の作りとは別のファイルに置いている
 * （"use server" のファイルからは関数しか公開できないため、ここに分けている）。
 */
export const Post = z.object({
  title: z.string().trim().min(1, "タイトルを入力してください").max(60, "タイトルは60文字までです"),
  description: z.string().trim().max(300, "説明は300文字までです"),
  tags: z.array(z.string()).min(1, "タグを1つ以上選んでください").max(5, "タグは5つまでです"),
  // サンプル動画として投稿してもらうため、「完全版を見る」のリンクは必須
  link: z.string().trim().min(1, "「完全版を見る」のリンクを入れてください").max(2048),
  category: z.enum(["women", "men", "couple"], { message: "ジャンル（出演者）を選んでください" }),
  intensity: z.coerce.number("刺激の強さを選んでください").int().min(1, "刺激の強さを選んでください").max(3),
  visibility: z.enum(["public", "private"]).default("public"),
  commentsEnabled: z.coerce.boolean().default(true),
});

/** 下書きは、まだ全部そろっていなくても保存できる */
export const Draft = Post.partial({ title: true, tags: true, category: true, intensity: true, link: true }).extend({
  title: z.string().trim().max(60).default(""),
  tags: z.array(z.string()).max(5).default([]),
});

