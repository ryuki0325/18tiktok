import { eq, sql } from "drizzle-orm";
import type { DB } from "./index";
import * as s from "./schema";
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/crypto";
import { ALL_QUIZ_TAGS, TAG_GROUPS, type VideoCategory } from "@/lib/audience";

export const SEED_TAGS = [...new Set([...ALL_QUIZ_TAGS, ...TAG_GROUPS.flatMap((g) => g.tags)])];

const DEMO: { handle: string; category: VideoCategory; hue: number[]; videos: { title: string; desc: string; tags: string[]; likes: number; link: string | null; intensity?: number }[] }[] = [
  { handle: "luna_night", category: "women", hue: [285, 320, 250], videos: [
    { title: "雨上がりの窓辺", desc: "雨上がりの夜、ネオンが滲む窓辺で。少しだけ特別な時間を。", tags: ["セクシー", "大人の色気", "ベッドルーム", "ランジェリー"], intensity: 2, likes: 123000, link: "https://example.com/luna/1" },
    { title: "紫の時間", desc: "照明を落とした部屋で、ゆっくり流れる夜。", tags: ["ランジェリー", "誘惑", "ホテル"], intensity: 3, likes: 18400, link: null },
  ] },
  { handle: "aoi_lounge", category: "men", hue: [205, 230, 180], videos: [
    { title: "深夜のドライブ", desc: "深夜のドライブ。高速の光の帯をゆっくり追いかけて。", tags: ["車内", "細マッチョ", "大人の色気"], intensity: 1, likes: 84500, link: "https://partner-a.example/aoi" },
    { title: "湾岸の灯り", desc: "夜明け前の湾岸。静かな水面に映る街の灯り。", tags: ["バスルーム", "筋肉質", "囁き"], intensity: 2, likes: 32700, link: "https://partner-a.example/aoi/2" },
  ] },
  { handle: "rin.velvet", category: "couple", hue: [345, 20, 300], videos: [
    { title: "ベルベットと低いジャズ", desc: "ベルベットの赤と、低いジャズ。今夜のプレイリストと一緒に。", tags: ["ラブラブ", "イチャイチャ", "ホテル", "リアルな関係"], intensity: 3, likes: 56100, link: null },
  ] },
  { handle: "mio_gold", category: "women", hue: [38, 25, 55], videos: [
    { title: "琥珀色のラウンジ", desc: "ホテルのラウンジ、琥珀色の照明。グラスの音だけが響く。", tags: ["ホテル", "美脚", "年上の女性"], intensity: 1, likes: 211000, link: "https://example.com/mio" },
    { title: "仕事終わりのバー", desc: "仕事終わりのバー。カウンター越しの、短い会話。", tags: ["ナイトプール", "グラマー", "刺激的"], intensity: 2, likes: 47800, link: null },
  ] },
];

const DEMO_COMMENTS = ["色の雰囲気が本当にきれい…", "このシリーズ毎回楽しみにしてます", "BGMの曲名知りたいです！", "夜に見ると落ち着く"];

/** 何度呼んでも安全（初回だけ入る） */
export async function seed(db: DB, opts: { demo: boolean }) {
  await db.insert(s.tags).values(SEED_TAGS.map((name) => ({ name, slug: encodeURIComponent(name) }))).onConflictDoNothing();
  await db.insert(s.affiliateDomains).values([
    { domain: "example.com", displayName: "Example（提携先サンプル）" },
    { domain: "partner-a.example", displayName: "Partner A（サンプル）" },
    { domain: "partner-b.example", displayName: "Partner B（サンプル）" },
  ]).onConflictDoNothing();

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const [admin] = await db.select().from(s.users).where(eq(s.users.email, adminEmail));
  if (!admin) {
    let pw = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? null : "glow-admin-dev");
    if (!pw) {
      // 本番で ADMIN_PASSWORD を入れ忘れた場合：ランダムな初期パスワードを作り、サーバーのログに一度だけ表示する
      pw = randomBytes(12).toString("base64url");
      console.warn(`[glow] ADMIN_PASSWORD が未設定のため、管理者の初期パスワードを自動で作りました：${adminEmail} / ${pw} （ログイン後、ADMIN_PASSWORD の設定を推奨）`);
    }
    {
      await db.insert(s.users).values({
        email: adminEmail, handle: "admin", displayName: "運営", role: "super_admin",
        passwordHash: await hashPassword(pw), emailVerifiedAt: new Date(),
      }).onConflictDoNothing();
    }
  }

  if (!opts.demo) return;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.videos);
  if (n > 0) return;

  const tagRows = await db.select().from(s.tags);
  const tagId = new Map(tagRows.map((t) => [t.name, t.id]));
  const demoPw = await hashPassword("glow-demo-password");
  let hoursAgo = 2;
  const videoIds: string[] = [];
  for (const c of DEMO) {
    const [u] = await db.insert(s.users).values({
      email: `${c.handle.replace(/\W/g, "")}@demo.example`, handle: c.handle, displayName: c.handle,
      passwordHash: demoPw, emailVerifiedAt: new Date(), avatarHue: c.hue[0],
    }).returning();
    await db.insert(s.creatorProfiles).values({ userId: u.id, status: "approved", approvedPosts: c.videos.length, approvedAt: new Date(), bio: "デモ用の投稿者です。" });
    for (const v of c.videos) {
      const shift = videoIds.length * 17;
      const [row] = await db.insert(s.videos).values({
        creatorId: u.id, title: v.title, description: v.desc, status: "published", category: c.category, intensity: v.intensity ?? 1,
        hue: [(c.hue[0] + shift) % 360, (c.hue[1] + shift) % 360, (c.hue[2] + shift) % 360] as [number, number, number],
        baseLikes: v.likes, reviewRequired: false, publishedAt: new Date(Date.now() - hoursAgo * 3600_000),
      }).returning();
      hoursAgo += 7;
      videoIds.push(row.id);
      await db.insert(s.videoTags).values(v.tags.map((t) => ({ videoId: row.id, tagId: tagId.get(t)! })));
      if (v.link) {
        const domain = new URL(v.link).hostname;
        await db.insert(s.outboundLinks).values({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 16), videoId: row.id, url: v.link, domain, status: "active" });
      }
    }
  }
  const [viewer] = await db.insert(s.users).values({
    email: "viewer@demo.example", handle: "night_owl", displayName: "night_owl", passwordHash: demoPw, emailVerifiedAt: new Date(), avatarHue: 210,
  }).returning();
  for (const [i, body] of DEMO_COMMENTS.entries()) {
    await db.insert(s.comments).values({ videoId: videoIds[i % 3], userId: viewer.id, body });
  }
  // ダッシュボード用：直近14日の再生
  const rows: (typeof s.views.$inferInsert)[] = [];
  for (let d = 0; d < 14; d++) {
    for (const vid of videoIds.slice(0, 2)) {
      for (let k = 0; k < 10 + d * 3; k++) rows.push({ videoId: vid, viewerKey: `d:seed${k}`, isValid: true, createdAt: new Date(Date.now() - (13 - d) * 86400_000 - k * 60_000) });
    }
  }
  await db.insert(s.views).values(rows);
}
