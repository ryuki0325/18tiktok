import "server-only";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { appendChained } from "./ledger";
import { sha256 } from "./crypto";

/**
 * 投稿者の登録（アフィリエイト）と、投稿者になるときの同意。
 *
 * 【運営の確認を置かない代わりに何をしているか】
 * 申請を人が見て通す仕組みをなくしたので、入口で止める力は弱くなる。
 * そのぶん、
 *   1) 同意した文面と項目を、書き換えられない形で残す（creator_attestations）
 *   2) アフィリエイトIDは1つにつき1人しか登録できない（なりすましの重複を防ぐ）
 *   3) いちど登録したものは本人が変えられない（後から別人のIDに差し替えさせない）
 *   4) 動画は引き続き全件を人が審査する（公開前の関門はここに残る）
 * で後から説明できる状態をつくる。
 *
 * これで安全になるわけではない。入口が緩い以上、通報と審査の運用が要になる。
 */

/** 同意の文面の版。文面を変えたら必ず上げる（古い同意と区別できなくなるため） */
export const ATTEST_VERSION = 1;

/** 投稿者になるときに同意してもらう項目。順番と文面がそのまま記録に残る */
export const ATTESTATIONS = [
  { key: "age", text: "出演者は自分を含め全員が18歳以上です。年齢を確認できる書類を自分で確認しました。" },
  { key: "consent", text: "出演者全員から、この動画をインターネットで公開することについて同意を得ています。" },
  { key: "record", text: "出演者の年齢と同意の記録を自分で保管しており、運営から求められたら提示します。" },
  { key: "rights", text: "投稿する動画は自分が権利を持つものです。他人の動画の転載・切り抜き・AIによる他人の再現ではありません。" },
  { key: "law", text: "日本の法令に沿って必要な修整を行います。わいせつ物頒布等の罪にあたる無修整の動画は投稿しません。" },
  { key: "illegal", text: "盗撮・脅迫・薬物・動物・暴力など、違法な行為を含む動画は投稿しません。" },
  { key: "affiliate", text: "登録するアフィリエイトIDは自分のものです。他人のIDを登録していません。" },
  { key: "liable", text: "虚偽の申告や違反があった場合、アカウントの停止・動画の削除・法的措置の対象になることに同意します。" },
  { key: "report", text: "出演者本人や権利者から削除の求めがあった場合、運営がただちに非公開にすることに同意します。" },
] as const;

export type AttestKey = (typeof ATTESTATIONS)[number]["key"];
export const ATTEST_KEYS = ATTESTATIONS.map((a) => a.key) as AttestKey[];
const ATTEST_TEXT = ATTESTATIONS.map((a) => `${a.key}:${a.text}`).join("\n");

/** 同意の記録を残す（書き換えられない形で積む） */
export async function recordAttestation(conn: DB, userId: string, items: string[], ipHash: string, userAgent: string) {
  return appendChained(conn, s.creatorAttestations, {
    userId, version: ATTEST_VERSION, textHash: sha256(ATTEST_TEXT),
    items, ipHash, userAgent: userAgent.slice(0, 300),
  });
}

export type AddResult = { ok: true } | { ok: false; error: string };

/** アフィリエイトIDの形。サービスによって幅があるので、ゆるめに見て明らかな間違いだけ弾く */
export function checkAffiliateId(raw: string): { ok: true; id: string } | { ok: false; error: string } {
  const id = raw.normalize("NFKC").trim();
  if (!id) return { ok: false, error: "アフィリエイトIDを入力してください" };
  if (id.length > 64) return { ok: false, error: "アフィリエイトIDが長すぎます（64文字まで）" };
  if (!/^[A-Za-z0-9._@~-]+$/.test(id)) return { ok: false, error: "アフィリエイトIDに使えない文字が含まれています" };
  return { ok: true, id };
}

/**
 * アフィリエイトを1つ足す。
 * 同じサービスで同じIDは、ほかの人が登録済みなら足せない（なりすまし対策）。
 */
export async function addAffiliate(conn: DB, userId: string, destinationId: string, rawId: string): Promise<AddResult> {
  const c = checkAffiliateId(rawId);
  if (!c.ok) return c;
  const [dest] = await conn.select().from(s.destinations).where(eq(s.destinations.id, destinationId));
  if (!dest || dest.status !== "approved") return { ok: false, error: "このサービスはいま登録できません" };

  const [dup] = await conn.select({ userId: s.creatorAffiliates.userId }).from(s.creatorAffiliates)
    .where(and(eq(s.creatorAffiliates.destinationId, destinationId), eq(s.creatorAffiliates.affiliateId, c.id)));
  if (dup) {
    return dup.userId === userId
      ? { ok: false, error: "このアフィリエイトIDはすでに登録されています" }
      : { ok: false, error: "このアフィリエイトIDは別のアカウントで登録されています。お心当たりがない場合は問い合わせからご連絡ください" };
  }
  await conn.insert(s.creatorAffiliates).values({ userId, destinationId, affiliateId: c.id });
  return { ok: true };
}

/** その人が登録しているアフィリエイト（サービス名つき） */
export async function listAffiliates(conn: DB, userId: string) {
  return conn.select({
    id: s.creatorAffiliates.id,
    affiliateId: s.creatorAffiliates.affiliateId,
    status: s.creatorAffiliates.status,
    createdAt: s.creatorAffiliates.createdAt,
    destinationId: s.destinations.id,
    serviceName: s.destinations.serviceName,
    domain: s.destinations.domain,
  }).from(s.creatorAffiliates)
    .innerJoin(s.destinations, eq(s.destinations.id, s.creatorAffiliates.destinationId))
    .where(eq(s.creatorAffiliates.userId, userId))
    .orderBy(s.creatorAffiliates.createdAt);
}

/** 投稿に使えるサービス（自分が有効なIDを登録しているものだけ） */
export async function postableDestinations(conn: DB, userId: string) {
  const rows = await listAffiliates(conn, userId);
  const seen = new Set<string>();
  return rows.filter((r) => r.status === "active" && !seen.has(r.destinationId) && seen.add(r.destinationId))
    .map((r) => ({ id: r.destinationId, serviceName: r.serviceName, domain: r.domain }));
}
