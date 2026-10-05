"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ageGateSessions } from "@/db/schema";
import { AG_COOKIE, makeAgToken } from "./agegate-token";
import { sha256 } from "./crypto";
import { getSetting } from "./settings";

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/age-gate") ? n : "/");

export async function acceptAgeGate(_: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  let target = "/";
  try {
    const conn = await db();
    const days = await getSetting("age_gate.ttl_days", conn);
    const version = await getSetting("age_gate.version", conn);
    const expiresAt = new Date(Date.now() + days * 86400_000);
    const ua = (await headers()).get("user-agent") ?? "";
    const [row] = await conn.insert(ageGateSessions).values({ gateVersion: version, uaHash: sha256(ua).slice(0, 32), expiresAt }).returning();
    const jar = await cookies();
    jar.set(AG_COOKIE, makeAgToken(row.id, expiresAt), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
    });
    // ログイン中なら、年齢の状態も「確認済み」にする（制限中の人は変えない）
    const { currentUser } = await import("./auth");
    const u = await currentUser();
    if (u && u.ageStatus === "unknown") {
      const { users } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      await conn.update(users).set({ ageStatus: "age_verified" }).where(eq(users.id, u.id));
    }
    const next = safeNext(formData.get("next"));
    // 好みの質問は利用者が増えてから復活させる。今は年齢確認の後すぐにフィードへ
    target = next;
  } catch (e) {
    console.error("[glow] 年齢確認の保存に失敗しました", e);
    if (e instanceof Error && e.name === "DatabaseNotConfiguredError") return { error: "サイトの準備中です（データベースが未接続です）。運営者は /api/health で設定状況を確認してください。" };
    return { error: "ただいま混み合っているか、サーバーの準備中です。少し待ってからもう一度お試しください。" };
  }
  redirect(target);
}

export async function declineAgeGate() {
  redirect("/leave");
}
