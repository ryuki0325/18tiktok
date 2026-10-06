import "server-only";
import { desc } from "drizzle-orm";
import type { DB } from "@/db";
import { adminAuditLogs, creatorAttestations, creatorPenalties, reportActions, userSanctions, videoConsents } from "@/db/schema";
import { chainHash, GENESIS } from "./crypto";

type Chained = typeof adminAuditLogs | typeof reportActions | typeof videoConsents | typeof creatorPenalties | typeof userSanctions | typeof creatorAttestations;

/**
 * 追記型テーブルに、直前の行のハッシュをつないで1行追加する。
 * UPDATE/DELETE はDBトリガーで禁止されているので、改ざんするとチェーンが切れて検出できる。
 */
export async function appendChained<T extends Chained>(
  conn: DB, table: T, values: Omit<T["$inferInsert"], "prevHash" | "rowHash" | "id" | "createdAt">,
) {
  return conn.transaction(async (tx) => {
    // 4つの追記型テーブルは id / rowHash を共通に持つ。ジェネリクスでは drizzle の型が解けないため代表型で扱う
    const t = table as unknown as typeof adminAuditLogs;
    const [last] = await tx.select({ h: t.rowHash }).from(t).orderBy(desc(t.id)).limit(1);
    const prevHash = last?.h ?? GENESIS;
    const rowHash = chainHash(prevHash, values);
    const [row] = await tx.insert(t).values({ ...values, prevHash, rowHash } as never).returning();
    return row as unknown as T["$inferSelect"];
  });
}

/** チェーンを先頭から検証し、壊れている行のIDを返す（なければ null） */
export async function verifyChain(conn: DB, table: Chained): Promise<number | null> {
  const t = table as unknown as typeof adminAuditLogs;
  const rows = await conn.select().from(t).orderBy(t.id);
  let prev = GENESIS;
  for (const r of rows as Record<string, unknown>[]) {
    const { id, prevHash, rowHash, createdAt, ...rest } = r;
    void createdAt;
    if (prevHash !== prev || chainHash(prev, rest) !== rowHash) return id as number;
    prev = rowHash as string;
  }
  return null;
}

export function audit(conn: DB, adminId: string | null, action: string, targetType: string, targetId?: string | null, detail?: unknown) {
  return appendChained(conn, adminAuditLogs, { adminId, action, targetType, targetId: targetId ?? null, detail: detail ?? null });
}
