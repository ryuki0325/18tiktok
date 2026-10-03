// drizzle-kit が生成するSQLの "public". を取り除く。
// テーブルを接続先のスキーマ（Supabase では "glow"）に作れるようにするため。db:generate の後に自動で実行される。
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
for (const f of readdirSync("drizzle").filter((x) => x.endsWith(".sql"))) {
  const p = `drizzle/${f}`;
  const s = readFileSync(p, "utf8");
  const t = s.replaceAll('"public".', "");
  if (s !== t) { writeFileSync(p, t); console.log(`unqualified: ${p}`); }
}
