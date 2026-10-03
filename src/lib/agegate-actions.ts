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
    const next = safeNext(formData.get("next"));
    target = jar.get("onb")?.value === "1" || next !== "/" ? next : "/welcome/tags";
  } catch (e) {
    console.error("[glow] 年齢確認の保存に失敗しました", e);
    return { error: "ただいま混み合っているか、サーバーの準備中です。少し待ってからもう一度お試しください。" };
  }
  redirect(target);
}

export async function declineAgeGate() {
  redirect("/leave");
}
