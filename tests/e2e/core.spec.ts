import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";

const passGate = async (page: Page) => {
  await page.goto("/age-gate");
  await page.getByRole("button", { name: "はい、18歳以上です" }).click();
  await page.waitForURL(/welcome\/tags|\/$/);
};

test.describe("年齢確認ゲート", () => {
  test("未同意ならどのページもゲートへ。ゲートのHTMLに動画情報は含まれない", async ({ page }) => {
    for (const path of ["/", "/explore", "/u/mio_gold", "/tags/%E5%A4%9C%E6%99%AF"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/age-gate\?next=/);
    }
    const html = await page.content();
    expect(html).not.toContain("luna_night");
    expect(html).not.toContain("琥珀色");
    const res = await page.request.get("/age-gate");
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  });

  test("APIを直接呼んでも、未同意なら451で中身を返さない", async ({ request }) => {
    const r = await request.get("/api/v1/feed");
    expect(r.status()).toBe(451);
    expect(await r.text()).not.toContain("luna_night");
  });

  test("偽造したCookieは通らない", async ({ page, context }) => {
    await context.addCookies([{ name: "ag", value: "11111111-2222-3333-4444-555555555555.9999999999.forged", url: "http://localhost:3200" }]);
    await page.goto("/");
    await expect(page).toHaveURL(/age-gate/);
  });

  test("「いいえ」は退出ページへ", async ({ page }) => {
    await page.goto("/age-gate");
    await page.getByRole("button", { name: "いいえ、退出する" }).click();
    await expect(page).toHaveURL(/\/leave/);
  });

  test("同意するとフィードが見られる", async ({ page }) => {
    await passGate(page);
    await page.goto("/");
    await expect(page.locator(".item.active")).toBeVisible();
    await expect(page.getByRole("tab", { name: "おすすめ" })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("通報と自動非公開", () => {
  test("未成年の疑いは送信と同時にフィードから消える", async ({ page, request }) => {
    await passGate(page);
    await page.goto("/");
    const id = await page.locator(".item.active").getAttribute("data-vid");
    await page.locator(".item.active").getByRole("button", { name: "通報" }).click();
    await page.getByRole("radio", { name: /未成年の疑い/ }).click();
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.getByRole("status")).toContainText("非公開");
    await expect(page.locator(`.item[data-vid="${id}"]`)).toHaveCount(0);
    const feed = await page.request.get("/api/v1/feed?tab=recommended&offset=0");
    expect(await feed.text()).not.toContain(id!);
    void request;
  });
});

test.describe("外部リンク", () => {
  test("本編を見る → 確認画面（移動先ドメインとPR表記）→ クリックが記録されURLが返る", async ({ page }) => {
    await passGate(page);
    await page.goto("/");
    // 外部リンクのある動画までめくる
    for (let i = 0; i < 6 && !(await page.locator(".item.active a.cta").count()); i++) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(600);
    }
    await page.locator(".item.active a.cta").first().click();
    await expect(page).toHaveURL(/\/out\//);
    await expect(page.locator(".domain")).toHaveText(/example/);
    await expect(page.getByText("このリンクには広告が含まれます")).toBeVisible();
    const id = page.url().split("/out/")[1];
    const r = await page.request.post(`/api/v1/out/${id}`, { headers: { origin: "http://localhost:3200" }, data: {} });
    expect(r.ok()).toBe(true);
    expect((await r.json()).url).toMatch(/^https:\/\//);
    const forged = await page.request.post(`/api/v1/out/${id}`, { headers: { origin: "https://evil.example" }, data: {} });
    expect(forged.status()).toBe(403);
  });
});

test.describe("権限", () => {
  test("管理画面はログインと2段階認証が必要", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.fill("#email", "admin@example.com");
    await page.fill("#password", "glow-admin-e2e");
    await page.getByRole("button", { name: /次へ/ }).click();
    await expect(page).toHaveURL(/\/admin\/mfa/);
    await page.goto("/admin/reports");
    await expect(page).toHaveURL(/\/admin\/mfa/);
    const secret = (await page.locator("code").textContent())!.trim();
    await page.fill('[aria-label="6桁のコード"]', totp(secret));
    await page.getByRole("button", { name: "確認" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
  });

  test("一般ユーザーは投稿画面に入れず申請へ回される", async ({ page }) => {
    await passGate(page);
    await page.goto("/login");
    await page.fill("#email", "viewer@demo.example");
    await page.fill("#password", "glow-demo-password");
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.waitForURL(/\/me$/);
    await page.goto("/creator/new");
    await expect(page).toHaveURL(/\/creator\/apply/);
  });
});

function totp(secret: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const ch of secret) { val = (val << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", Buffer.from(out)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, "0");
}
