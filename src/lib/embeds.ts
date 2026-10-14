import "server-only";
import type { DB } from "@/db";
import { checkAffiliateUrl } from "./url";
import { normalizeEmbed } from "./embed-normalize";
import { getSetting } from "./settings";

/**
 * 埋め込み動画URLの検証。
 * 出どころ（ホスト）は制限せず自由に埋め込める。入力は、ページURL でも
 * <iframe> の埋め込みコードでもよく、まず埋め込み用URLに正規化してから安全性
 * （https・IP直書き・短縮URL・制御文字など）をチェックする。
 * 掲載の正当性は「承認済みアフィリURLの添付が必須」という仕組みで担保する方針。
 */
export async function checkEmbedUrl(conn: DB, raw: string) {
  // ページURL・埋め込みコードを、iframe に出せる埋め込み用URLへ正規化
  const normalized = normalizeEmbed(raw);
  if (!normalized) return { ok: false as const, error: "埋め込みURL、または『共有→埋め込み』のコード（<iframe…>）を入れてください" };
  // URLの安全性チェック（https・IP直書き・短縮URL等）はアフィリンクと同じ関数を使い回す
  const chk = checkAffiliateUrl(normalized, await getSetting("shortener_domains", conn));
  if (!chk.ok) return { ok: false as const, error: chk.reason };
  const host = new URL(chk.url).hostname.toLowerCase();
  return { ok: true as const, embedUrl: chk.url, embedDomain: host };
}

/** 埋め込み iframe のサンドボックス属性（最小限の権限だけ許可する） */
export const EMBED_SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";
