import "server-only";
import { and, eq, or } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { checkAffiliateUrl, registrableDomain } from "./url";
import { getSetting } from "./settings";

/**
 * 埋め込み動画URLの検証。
 * 自社に保存せず、提携先の公式サーバーから再生する方式のため、
 * 「出どころ（ホスト）」が運営の許可リスト（embed_sources）にあるものだけを通す。
 * これが無断転載の拡散を防ぐ出どころ審査の実体（リーチサイト規制への対応）。
 */
export async function checkEmbedUrl(conn: DB, raw: string) {
  // URLの安全性チェック（https・IP直書き・短縮URL等）はアフィリンクと同じ関数を使い回す
  const chk = checkAffiliateUrl(raw, await getSetting("shortener_domains", conn));
  if (!chk.ok) return { ok: false as const, error: chk.reason };
  const host = new URL(chk.url).hostname.toLowerCase();
  const reg = registrableDomain(host);
  // 完全なホスト（cc3001.dmm.co.jp 等）でも、登録ドメイン（dmm.co.jp）でも許可できる
  const [src] = await conn.select().from(s.embedSources)
    .where(and(eq(s.embedSources.isActive, true), or(eq(s.embedSources.domain, host), eq(s.embedSources.domain, reg))));
  if (!src) return { ok: false as const, error: "この埋め込み元は許可されていません。公式サンプルなど、運営が許可した出どころのURLを入れてください" };
  return { ok: true as const, embedUrl: chk.url, embedDomain: host };
}

/** 埋め込み iframe のサンドボックス属性（最小限の権限だけ許可する） */
export const EMBED_SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";
