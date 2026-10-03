import { expect, test, type Page } from "@playwright/test";

const passGate = async (page: Page) => {
  await page.goto("/age-gate");
  await page.getByRole("button", { name: "はい、18歳以上です" }).click();
  await page.waitForURL(/welcome\/tags|\/$/);
  await page.goto("/");
  await expect(page.locator(".item.active")).toBeVisible();
};

test("ホーム画面に追加するための manifest とアイコンは年齢確認なしで取得できる", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.ok()).toBe(true);
  const j = await m.json();
  expect(j.display).toBe("standalone");
  expect(j.icons.length).toBeGreaterThan(0);
  expect((await request.get("/icons/icon-192.png")).ok()).toBe(true);
  expect((await request.get("/sw.js")).ok()).toBe(true);
});

test("ダブルタップでいいね（ハートが出る）", async ({ page }) => {
  await passGate(page);
  const item = page.locator(".item.active");
  const like = item.getByRole("button", { name: "いいね" });
  await expect(like).toHaveAttribute("aria-pressed", "false");
  const box = (await item.boundingBox())!;
  await page.mouse.click(box.x + box.width / 3, box.y + box.height / 3);
  await page.mouse.click(box.x + box.width / 3, box.y + box.height / 3);
  await expect(item.locator(".burst")).toHaveCount(1);
  await expect(like).toHaveAttribute("aria-pressed", "true");
});

test("1回タップで一時停止", async ({ page }) => {
  await passGate(page);
  const item = page.locator(".item.active");
  const box = (await item.boundingBox())!;
  await page.mouse.click(box.x + box.width / 3, box.y + box.height / 3);
  await expect(item).toHaveClass(/paused/);
});

test("左スワイプで投稿者ページへ", async ({ page }) => {
  await passGate(page);
  const box = (await page.locator(".item.active").boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 6 });
  await page.mouse.up();
  await expect(page).toHaveURL(/\/u\//);
});

test("シートは下にスワイプして閉じられる", async ({ page }) => {
  await passGate(page);
  await page.locator(".item.active").getByRole("button", { name: "シェア" }).click();
  const grab = page.locator(".sheet .grab");
  const b = (await grab.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".sheet")).toHaveCount(0);
});

test("入力欄は16px以上（iPhoneでフォーカス時に拡大されない）", async ({ page }) => {
  await page.goto("/age-gate");
  await page.getByRole("button", { name: "はい、18歳以上です" }).click();
  await page.waitForURL(/welcome\/tags|\/$/);
  await page.goto("/login");
  const size = await page.locator("#email").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

test("はじめに：ジャンルを選ぶ → タグ3つ → そのジャンルのフィード", async ({ page }) => {
  await page.goto("/age-gate");
  await page.getByRole("button", { name: "はい、18歳以上です" }).click();
  await page.waitForURL(/welcome\/tags/);
  await page.getByRole("radio", { name: /男性/ }).click();
  await expect(page.getByRole("heading", { name: /好みを/ })).toBeVisible();
  const start = page.getByRole("button", { name: /あと3つ|はじめる/ });
  await expect(start).toBeDisabled();
  for (const t of ["セクシー", "ホテル", "ボディライン"]) await page.locator(".onb-chip", { hasText: new RegExp(`^${t}$`) }).click();
  await page.getByRole("button", { name: /はじめる/ }).click();
  await page.waitForURL(/\/$/);
  const r = await page.request.get("/api/v1/feed?tab=recommended");
  const j = await r.json();
  expect(j.videos.length).toBeGreaterThan(0);
  expect(j.videos.every((v: { category: string }) => v.category === "men")).toBe(true);
});
