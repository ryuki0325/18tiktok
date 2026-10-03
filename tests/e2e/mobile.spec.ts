import { expect, test, type Page } from "@playwright/test";

const passGate = async (page: Page) => {
  await page.goto("/age-gate");
  await page.getByRole("button", { name: "はい、18歳以上です" }).click();
  await page.waitForURL(/\/$/);
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
  await page.locator(".item.active").getByRole("button", { name: "その他" }).click();
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
  await page.waitForURL(/\/$/);
  await page.goto("/login");
  const size = await page.locator("#email").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

test("年齢確認の「はい」で、好みの質問を挟まずにすぐフィードへ", async ({ page }) => {
  await page.goto("/age-gate");
  await page.getByRole("button", { name: "はい、18歳以上です" }).click();
  await page.waitForURL(/\/$/);
  await expect(page.locator(".item.active")).toBeVisible();
});

test("（今は非表示）好みの質問ページは直接開けば使える", async ({ page }) => {
  await passGate(page);
  await page.goto("/welcome/tags");
  await page.getByRole("radio", { name: /男性/ }).click();
  await expect(page.getByRole("heading", { name: "今夜の気分は？" })).toBeVisible();
  await page.getByRole("radio", { name: /大人の色気/ }).click();
  await expect(page.getByRole("heading", { name: /シチュエーション/ })).toBeVisible();
  await page.locator(".onb-chip", { hasText: /^車内$/ }).click();
  await page.locator(".onb-chip", { hasText: /^バスルーム$/ }).click();
  await page.getByRole("button", { name: /次へ（2つ選択中）/ }).click();
  await expect(page.getByRole("heading", { name: "惹かれるのは？" })).toBeVisible();
  await expect(page.locator(".onb-chip", { hasText: /^筋肉質$/ })).toBeVisible();
  await expect(page.locator(".onb-chip", { hasText: /^スレンダー$/ })).toHaveCount(0); // 男性を選んだので女性向けの選択肢は出ない
  await page.locator(".onb-chip", { hasText: /^筋肉質$/ }).click();
  await page.getByRole("button", { name: /次へ/ }).click();
  await page.getByRole("radio", { name: /ソフト/ }).click();
  await page.waitForURL(/\/$/);
  const j = await (await page.request.get("/api/v1/feed?tab=recommended")).json();
  expect(j.videos.length).toBeGreaterThan(0);
  expect(j.videos.every((v: { category: string; intensity: number }) => v.category === "men" && v.intensity <= 1)).toBe(true);
});

test("「…」に共有・興味がない・通報・動画速度がまとまっている。速度は覚えておく", async ({ page }) => {
  await passGate(page);
  const item = page.locator(".item.active");
  await expect(item.getByRole("button", { name: "シェア" })).toHaveCount(0);
  await expect(item.getByRole("button", { name: "通報" })).toHaveCount(0);
  await item.getByRole("button", { name: "その他" }).click();
  const sheet = page.locator(".sheet");
  for (const n of ["共有", "興味がない", "通報", /動画速度/]) await expect(sheet.getByRole("button", { name: n })).toBeVisible();
  await sheet.getByRole("button", { name: /動画速度/ }).click();
  await sheet.getByRole("radio", { name: "1.5x" }).click();
  await expect(page.locator(".sheet")).toHaveCount(0);
  await page.reload();
  await page.locator(".item.active").getByRole("button", { name: "その他" }).click();
  await expect(page.locator(".sheet").getByRole("button", { name: /動画速度/ })).toContainText("1.5x");
});

test("興味がない：その動画はフィードから消え、次からも出ない", async ({ page }) => {
  await passGate(page);
  const id = await page.locator(".item.active").getAttribute("data-vid");
  await page.locator(".item.active").getByRole("button", { name: "その他" }).click();
  await page.locator(".sheet").getByRole("button", { name: "興味がない" }).click();
  await page.locator(".sheet").getByRole("button", { name: /この動画に興味がない/ }).click();
  await expect(page.locator(`.item[data-vid="${id}"]`)).toHaveCount(0);
  const j = await (await page.request.get("/api/v1/feed?tab=recommended")).json();
  expect(j.videos.map((v: { id: string }) => v.id)).not.toContain(id);
});

test("全画面ボタン：戻るボタンだけの全画面表示になり、戻るで元に戻る", async ({ page }) => {
  await passGate(page);
  await page.locator(".item.active").getByRole("button", { name: "全画面で見る" }).click();
  const fs = page.locator(".fs");
  await expect(fs).toBeVisible();
  await expect(fs.getByRole("button")).toHaveCount(1);
  const box = (await fs.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.round(box.width)).toBe(vp.width);
  expect(Math.round(box.height)).toBe(vp.height);
  await fs.getByRole("button", { name: "全画面表示を終了" }).click();
  await expect(page.locator(".fs")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".item.active")).toBeVisible();
});

test("右上の検索 → 「探す」に移動し、キーワード入力欄にフォーカス", async ({ page }) => {
  await passGate(page);
  await page.locator(".feedtop").getByRole("button", { name: "検索" }).click();
  await page.waitForURL(/\/explore/);
  await expect(page.getByRole("searchbox", { name: "キーワードを入力" })).toBeFocused();
});

test("動画は画面の上端まで埋まっている", async ({ page }) => {
  await passGate(page);
  const box = (await page.locator(".item.active").boundingBox())!;
  expect(box.y).toBe(0);
  expect(Math.round(box.height)).toBe(page.viewportSize()!.height);
});
