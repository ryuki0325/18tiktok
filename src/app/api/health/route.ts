import { sql } from "drizzle-orm";
import { db } from "@/db";
import { secretSource } from "@/lib/crypto";

/** 公開後の動作確認用（秘密情報は返さない） */
export async function GET() {
  const out: Record<string, unknown> = {
    ok: true,
    database: process.env.DATABASE_URL ? "postgres" : "embedded",
    authSecret: secretSource() === "env" ? "設定済み" : "自動生成（AUTH_SECRET の設定を推奨）",
    adminPassword: process.env.ADMIN_PASSWORD ? "設定済み" : "未設定（初期パスワードを自動作成してサーバーのログに表示）",
  };
  try {
    const conn = await db();
    await conn.execute(sql`select 1`);
    out.db = "接続OK";
  } catch (e) {
    console.error("[glow] health: DB error", e);
    out.ok = false;
    out.db = "接続できません（サーバーのログを確認してください）";
  }
  return Response.json(out, { status: out.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
