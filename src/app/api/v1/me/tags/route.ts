import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { contentGuard, fail, json } from "@/lib/http";
import { DEFAULT_PREF } from "@/lib/theme";

const Body = z.object({ tags: z.array(z.string().max(30)).max(30), audience: z.enum(["women", "men", "gay", "lesbian", "all"]).default("all"), maxIntensity: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3) });

export async function PUT(req: Request) {
  const blocked = await contentGuard({ write: true });
  if (blocked) return blocked;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("INVALID", "選び方が正しくありません");
  const jar = await cookies();
  const opts = { sameSite: "lax" as const, path: "/", maxAge: 400 * 86400, httpOnly: true, secure: process.env.NODE_ENV === "production" };
  jar.set("ptags", encodeURIComponent(JSON.stringify(parsed.data.tags)), opts);
  jar.set("onb", "1", opts);
  jar.set("aud", parsed.data.audience, opts);
  jar.set("mi", String(parsed.data.maxIntensity), opts);
  const u = await currentUser();
  if (u) {
    await (await db()).insert(userPreferences).values({ userId: u.id, theme: DEFAULT_PREF, preferredTags: parsed.data.tags, audience: parsed.data.audience, maxIntensity: parsed.data.maxIntensity })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { preferredTags: parsed.data.tags, audience: parsed.data.audience, maxIntensity: parsed.data.maxIntensity, updatedAt: new Date() } });
  }
  return json({ ok: true });
}
