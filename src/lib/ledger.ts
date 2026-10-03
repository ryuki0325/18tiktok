import "server-only";
import { desc } from "drizzle-orm";
import type { DB } from "@/db";
import { adminAuditLogs, creatorPenalties, reportActions, videoConsents } from "@/db/schema";
import { chainHash, GENESIS } from "./crypto";

type Chained = typeof adminAuditLogs | typeof reportActions | typeof videoConsents | typeof creatorPenalties;

/**
 * 追記型テーブルに、直前の行のハッシュをつないで1行追加する。
 * UPDATE/DELETE はDBトリガーで禁止されているので、改ざんするとチェーンが切れて検出できる。
 */
export async function appendChained<T extends Chained>(
  conn: DB, table: T, values: Omit<T["$inferInsert"], "prevHash" | "rowHash" | "id" | "createdAt">,
) {
  return conn.transaction(async (tx) => {
    const [last] = await tx.select({ h: table.rowHash }).from(table).orderBy(desc(table.id)).limit(1);
    const prevHash = last?.h ?? GENESIS;
    const rowHash = chainHash(prevHash, values);
    const [row] = await tx.insert(table).values({ ...values, prevHash, rowHash } as T["$inferInsert"]).returning();
    return row;
  });
}

/** チェーンを先頭から検証し、壊れている行のIDを返す（なければ null） */
export async function verifyChain(conn: DB, table: Chained): Promise<number | null> {
  const rows = await conn.select().from(table).orderBy(table.id);
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
