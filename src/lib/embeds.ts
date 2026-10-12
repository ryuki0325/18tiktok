import "server-only";
import type { DB } from "@/db";
import { checkAffiliateUrl } from "./url";
import { getSetting } from "./settings";

/**
 * 埋め込み動画URLの検証。
 * 出どころ（ホスト）は制限せず自由に埋め込める。ただしURL自体の安全性
 * （https・IP直書き・短縮URL・制御文字など）はチェックする。
 * 掲載の正当性は「承認済みアフィリURLの添付が必須」という仕組みで担保する方針。
 */
export async function checkEmbedUrl(conn: DB, raw: string) {
  // URLの安全性チェック（https・IP直書き・短縮URL等）はアフィリンクと同じ関数を使い回す
  const chk = checkAffiliateUrl(raw, await getSetting("shortener_domains", conn));
  if (!chk.ok) return { ok: false as const, error: chk.reason };
  const host = new URL(chk.url).hostname.toLowerCase();
  return { ok: true as const, embedUrl: chk.url, embedDomain: host };
}

/** 埋め込み iframe のサンドボックス属性（最小限の権限だけ許可する） */
export const EMBED_SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";
