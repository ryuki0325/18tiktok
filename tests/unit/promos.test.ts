import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, setDbForTest, type DB } from "@/db";
import * as s from "@/db/schema";
import { getFeedPromos, parseAdCode, recordPromoClick, recordPromoImpression } from "@/lib/promos";

let db: DB;

beforeAll(async () => {
  db = await createDb({ memory: true, seedDemo: false });
  // lib 内の db() がこのメモリDBを使うようにする
  setDbForTest(Promise.resolve(db));
});

const add = async (v: Partial<typeof s.promos.$inferInsert>) => {
  const [row] = await db.insert(s.promos).values({ kind: "affiliate", title: "t", targetUrl: "https://ex.example/a", ...v }).returning();
  return row;
};

describe("プロモ枠（広告・アフィリ）", () => {
  it("有効な枠だけを重みの大きい順に返す。停止中は出ない", async () => {
    await add({ title: "軽い", weight: 1, targetUrl: "https://ex.example/1" });
    await add({ title: "重い", weight: 10, targetUrl: "https://ex.example/2" });
    await add({ title: "停止", weight: 99, active: false, targetUrl: "https://ex.example/3" });
    const list = await getFeedPromos("all");
    expect(list.map((p) => p.title)).toEqual(["重い", "軽い"]); // 停止は除外・重み順
  });

  it("出し分け：all は全員、分岐指定はその分岐＋all に出る", async () => {
    await add({ title: "女性向けだけ", category: "women", weight: 5, targetUrl: "https://ex.example/w" });
    const toMen = await getFeedPromos("men");
    expect(toMen.find((p) => p.title === "女性向けだけ")).toBeUndefined(); // 男性視聴者には出ない
    const toWomen = await getFeedPromos("women");
    expect(toWomen.find((p) => p.title === "女性向けだけ")).toBeTruthy(); // 女性視聴者には出る
  });

  it("クリックは記録して遷移先を返す。bot（count=false）は返すが集計しない", async () => {
    const p = await add({ title: "計測", targetUrl: "https://ex.example/click" });
    expect(await recordPromoClick(p.id, true)).toBe("https://ex.example/click");
    expect(await recordPromoClick(p.id, false)).toBe("https://ex.example/click"); // URLは返す
    const [after] = await db.select().from(s.promos).where(eq(s.promos.id, p.id));
    expect(after.clicks).toBe(1); // 2回呼んだが、集計は人のぶん（1回）だけ
  });

  it("network はクリック遷移しない／https 以外・停止中・存在しないは null", async () => {
    const net = await add({ kind: "network", html: "<b>ad</b>", targetUrl: null, title: "" });
    expect(await recordPromoClick(net.id)).toBeNull();
    const bad = await add({ targetUrl: "http://ex.example/x" }); // http はダメ
    expect(await recordPromoClick(bad.id)).toBeNull();
    const off = await add({ active: false });
    expect(await recordPromoClick(off.id)).toBeNull();
    expect(await recordPromoClick("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("DTI等の広告コードを解釈する（バナー=アフィリ／iframe=ネットワーク）", () => {
    // DTI Cash のバナー（<a href><img>）
    const banner = `<a href='https://clear-tv.com/Click/1369012-369-240947' target='_blank' rel='noopener'><img src='https://pixelarchivenow.com/image/sakuralive_job/1369012.jpg' border=0></a>`;
    expect(parseAdCode(banner)).toEqual({ kind: "affiliate", targetUrl: "https://clear-tv.com/Click/1369012-369-240947", imageUrl: "https://pixelarchivenow.com/image/sakuralive_job/1369012.jpg" });
    // DTI Cash の HTML広告（<IFRAME>）
    const iframe = `<IFRAME SRC="https://galleries-pro.com/table/dx/newrashiteLP/index.html?affid=240947" width=960 height=1200 frameborder="no" scrolling="no"></IFRAME>`;
    expect(parseAdCode(iframe)).toEqual({ kind: "network", html: iframe });
    // 解釈できないものは null
    expect(parseAdCode("ただのテキスト")).toBeNull();
    expect(parseAdCode("")).toBeNull();
  });

  it("表示回数を記録する", async () => {
    const p = await add({ title: "imp" });
    await recordPromoImpression(p.id);
    await recordPromoImpression(p.id);
    const [after] = await db.select().from(s.promos).where(eq(s.promos.id, p.id));
    expect(after.impressions).toBe(2);
  });
});
