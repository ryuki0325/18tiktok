import { sql } from "drizzle-orm";
import { db } from "@/db";
import { secretSource } from "@/lib/crypto";
import { mediaStatus } from "@/lib/media";

/** 公開後の動作確認用（秘密情報は返さない） */
export async function GET() {
  const out: Record<string, unknown> = {
    ok: true,
    database: process.env.DATABASE_URL ? "postgres" : "embedded",
    authSecret: secretSource() === "env" ? "設定済み" : "自動生成（AUTH_SECRET の設定を推奨）",
    adminPassword: process.env.ADMIN_PASSWORD ? "設定済み" : "未設定（初期パスワードを自動作成してサーバーのログに表示）",
    media: mediaStatus(),
  };
  try {
    const conn = await db();
    await conn.execute(sql`select 1`);
    out.db = "接続OK";
  } catch (e) {
    console.error("[glow] health: DB error", e);
    out.ok = false;
    out.db = e instanceof Error && e.name === "DatabaseNotConfiguredError"
      ? "未接続：DATABASE_URL に PostgreSQL の接続文字列を設定してください（組み込みDBは無料プランのメモリ512MBでは動きません）"
      : "接続できません（サーバーのログを確認してください）";
  }
  return Response.json(out, { status: out.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
