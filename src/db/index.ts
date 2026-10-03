import "server-only";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { seed } from "./seed";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * DATABASE_URL があれば通常の PostgreSQL、なければ組み込みの PGlite（.data/pglite）を使う。
 * インフラが決まるまでは PGlite で開発し、本番では DATABASE_URL を入れるだけで切り替わる。
 */
export async function createDb(opts: { memory?: boolean; seedDemo?: boolean } = {}): Promise<DB> {
  let db: DB;
  const url = process.env.DATABASE_URL;
  if (url && !opts.memory) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    // prepare:false は Supabase などの接続プーラー（PgBouncer のトランザクションモード）でも動かすため
    const d = drizzle(postgres(url, { max: 10, prepare: false, onnotice: () => {} }), { schema, casing: "snake_case" });
    await migrate(d, { migrationsFolder: MIGRATIONS });
    db = d as unknown as DB;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    let client;
    if (opts.memory) client = new PGlite();
    else {
      const dir = path.join(process.cwd(), ".data", "pglite");
      await mkdir(dir, { recursive: true });
      client = new PGlite(dir);
    }
    const d = drizzle(client, { schema, casing: "snake_case" });
    await migrate(d, { migrationsFolder: MIGRATIONS });
    db = d as unknown as DB;
  }
  await seed(db, { demo: opts.seedDemo ?? process.env.SEED_DEMO !== "false" });
  return db;
}

const g = globalThis as unknown as { __glowDb?: Promise<DB> };

export function db(): Promise<DB> {
  if (!g.__glowDb) {
    // 初期化に失敗したら次のリクエストでやり直せるよう、キャッシュを捨てる
    g.__glowDb = createDb().catch((e) => { g.__glowDb = undefined; throw e; });
  }
  return g.__glowDb;
}

/** テスト用：差し替え */
export function setDbForTest(p: Promise<DB>) {
  g.__glowDb = p;
}

export { schema };
