"use server";
import { z } from "zod";
import { db } from "@/db";
import { takedownRequests } from "@/db/schema";
import { clientIpHash, rateLimit } from "./http";
import type { FormState } from "./account-actions";

const Body = z.object({
  name: z.string().trim().min(1, "お名前を入力してください").max(100),
  email: z.string().trim().email("メールアドレスの形式が正しくありません"),
  requesterType: z.enum(["本人", "権利者", "代理人", "その他"]),
  claimType: z.enum(["著作権", "肖像権・プライバシー", "出演同意の取消し", "名誉毀損", "未成年の疑い", "その他"]),
  targetUrl: z.string().trim().min(1, "対象のURLを入力してください").max(500),
  detail: z.string().trim().min(10, "詳しい内容を10文字以上で入力してください").max(4000),
});

export async function takedownAction(_: FormState, form: FormData): Promise<FormState> {
  if (!(await rateLimit(`takedown:${await clientIpHash()}`, 5, 3600))) return { error: "送信の回数が多すぎます。しばらくしてからお試しください" };
  if (form.get("truth") !== "on") return { error: "申告内容が正確であることの確認が必要です" };
  const parsed = Body.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const receipt = `TD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  await (await db()).insert(takedownRequests).values({ ...parsed.data, receipt });
  return { info: `受け付けました。受付番号：${receipt}。調査ののち、ご入力のメールアドレスに回答します。` };
}
