import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";

/**
 * 投稿者が自由に作るタグ。
 *
 * 【なぜ運営が見るまで広げないか】
 * タグは「探す」入口になる。危ない言葉のタグができると、それ自体が
 * そういう動画の集め先になってしまう。だから新しいタグは動画には付けるが、
 * 候補一覧・人気タグ・タグのページには、運営が見るまで出さない。
 *
 * 【ここで弾くもの】
 * 年齢を偽る言葉、同意のない撮影を指す言葉など、明らかに危ないものは
 * その場で断る。ただし言葉の判定だけで安全になるわけではないので、
 * 最終的な判断は人の審査に任せる（自動判定だけで結論を出さない）。
 */

export const TAG_MAX = 20;
export const TAG_MIN = 1;

/** 表記ゆれをそろえる（全角→半角、#を外す、空白を詰める） */
export function normalizeTag(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/^[#＃]+/, "")
    .replace(/[\s　]+/g, "")
    .trim()
    .slice(0, TAG_MAX);
}

/** そのまま広めてはいけない言葉。見つけたら断る（運営の審査にも回さない） */
const REFUSE: RegExp[] = [
  // 年齢を偽る・未成年を指す
  /(小学|中学|高校|女子高|高生|ロリ|幼[児女]|児童|未成年|十代|10代)/,
  // 同じ意味で使われる略語（単体で使われたときだけ）
  /^(jc|js|jk|c?js?k?)$/i,
  // 同意のない撮影・流出
  /(盗撮|隠し撮り|無修正流出|リベンジ|レイプ|強姦|昏睡|睡眠姦|薬物)/i,
  // 身元をさらす
  /(本名|住所|電話番号|勤務先|特定した)/i,
];

/** 宣伝・誘導に使われやすい形（URLや連絡先）は断る */
const LOOKS_LIKE_CONTACT = /(https?:|www\.|\.com|\.net|\.jp|@|line|telegram|t\.me)/i;

export type TagCheck = { ok: true; name: string } | { ok: false; error: string };

export function checkTag(raw: string): TagCheck {
  const name = normalizeTag(raw);
  if (name.length < TAG_MIN) return { ok: false, error: "タグを入力してください" };
  if (name.length > TAG_MAX) return { ok: false, error: `タグは${TAG_MAX}文字までです` };
  if (LOOKS_LIKE_CONTACT.test(name)) return { ok: false, error: "リンクや連絡先はタグにできません" };
  if (REFUSE.some((r) => r.test(name))) return { ok: false, error: "このタグは使えません。投稿ガイドラインをご確認ください" };
  return { ok: true, name };
}

/**
 * タグ名の配列を、タグのID配列に変える。
 * 既にあるものはそのまま使い、ないものは pending（運営待ち）で作る。
 * 断られた言葉は作らず、理由を返す。
 */
export async function resolveTags(conn: DB, names: string[], userId: string): Promise<{ ids: number[]; created: string[]; refused: string[] }> {
  const wanted: string[] = [];
  const refused: string[] = [];
  for (const raw of names) {
    const c = checkTag(raw);
    if (!c.ok) { refused.push(raw); continue; }
    if (!wanted.includes(c.name)) wanted.push(c.name);
  }
  if (!wanted.length) return { ids: [], created: [], refused };

  const found = await conn.select({ id: s.tags.id, name: s.tags.name }).from(s.tags).where(inArray(s.tags.name, wanted));
  const have = new Map(found.map((f) => [f.name, f.id]));
  const missing = wanted.filter((n) => !have.has(n));
  const created: string[] = [];
  for (const name of missing) {
    const [row] = await conn.insert(s.tags)
      .values({ name, slug: slugOf(name), status: "approved", createdBy: userId })
      .onConflictDoNothing({ target: s.tags.name }).returning({ id: s.tags.id });
    if (row) { have.set(name, row.id); created.push(name); continue; }
    // 同時に別の人が作った場合は、できたものを読み直す
    const [again] = await conn.select({ id: s.tags.id }).from(s.tags).where(eq(s.tags.name, name));
    if (again) have.set(name, again.id);
  }
  return { ids: wanted.map((n) => have.get(n)).filter((x): x is number => x !== undefined), created, refused };
}

/** URLに使う形。日本語はそのまま（Next.js がエンコードする） */
const slugOf = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || name;

/** 運営がタグを見て、広げる／広げないを決める */
export async function decideTag(conn: DB, id: number, approve: boolean) {
  await conn.update(s.tags).set({ status: approve ? "approved" : "rejected" }).where(eq(s.tags.id, id));
}

/** 運営待ちのタグ（よく使われている順） */
export async function pendingTags(conn: DB, limit = 100) {
  const { sql, desc } = await import("drizzle-orm");
  return conn.select({
    id: s.tags.id, name: s.tags.name, createdAt: s.tags.createdAt,
    n: sql<number>`count(${s.videoTags.videoId})::int`.as("n"),
  }).from(s.tags).leftJoin(s.videoTags, eq(s.videoTags.tagId, s.tags.id))
    .where(eq(s.tags.status, "pending")).groupBy(s.tags.id).orderBy(desc(sql`"n"`), s.tags.id).limit(limit);
}

/** 候補として見せてよいタグだけ */
export async function suggestableTags(conn: DB) {
  return conn.select({ name: s.tags.name }).from(s.tags).where(eq(s.tags.status, "approved")).orderBy(s.tags.id);
}

export const approvedOnly = () => and(eq(s.tags.status, "approved"));
