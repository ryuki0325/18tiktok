import { expect, test, type Page } from "@playwright/test";

const passGate = async (page: Page) => {
  await page.goto("/age-gate");
  await page.getByRole("button", { name: "はい、18歳以上です" }).click();
  await page.waitForURL(/welcome\/tags|\/$/);
  await page.goto("/");
  await expect(page.locator(".item.active")).toBeVisible();
};
const activeId = (page: Page) => page.locator(".item.active").getAttribute("data-vid");

/** 指で縦にドラッグする（duration ms かけて dy px 動かす） */
async function drag(page: Page, dy: number, duration: number, steps = 12) {
  const vp = page.viewportSize()!;
  const x = vp.width * 0.4, y0 = dy < 0 ? vp.height * 0.75 : vp.height * 0.3;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, y0 + (dy * i) / steps);
    await page.waitForTimeout(duration / steps);
  }
  await page.mouse.up();
  await page.waitForTimeout(700); // ばねのアニメーションが止まるまで
}

test("上にスワイプすると次の動画へ", async ({ page }) => {
  await passGate(page);
  const first = await activeId(page);
  await drag(page, -320, 250);
  expect(await activeId(page)).not.toBe(first);
});

test("滑り止め：どれだけ大きく・速く弾いても進むのは1本だけ", async ({ page }) => {
  await passGate(page);
  const ids: string[] = [];
  ids.push((await activeId(page))!);
  await drag(page, -2000, 120, 6);
  ids.push((await activeId(page))!);
  await drag(page, 320, 250); // 戻る
  expect(await activeId(page)).toBe(ids[0]);
  // 1回で2本以上進んでいないこと：1つ下に戻ると元の先頭
  expect(ids[1]).not.toBe(ids[0]);
});

test("少しだけゆっくり動かして離すと、元の動画に戻る", async ({ page }) => {
  await passGate(page);
  const first = await activeId(page);
  await drag(page, -60, 600);
  expect(await activeId(page)).toBe(first);
});

test("短くても素早く弾けば次へ（フリック）", async ({ page }) => {
  await passGate(page);
  const first = await activeId(page);
  await drag(page, -90, 60, 4);
  expect(await activeId(page)).not.toBe(first);
});

test("先頭で下に引っ張ると更新される", async ({ page }) => {
  await passGate(page);
  await drag(page, 420, 400);
  await expect(page.getByRole("status")).toContainText("新しい動画を読み込みました");
  await expect(page.locator(".item.active")).toBeVisible();
});

test("ホイール・トラックパッド：一連の操作で1本だけ進む", async ({ page }) => {
  await passGate(page);
  const first = await activeId(page);
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height / 2);
  for (let i = 0; i < 25; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(16); } // 慣性つきの連続イベント
  await page.waitForTimeout(800);
  const second = await activeId(page);
  expect(second).not.toBe(first);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(700);
  expect(await activeId(page)).toBe(first); // 1本しか進んでいなかった
});

test("キーボードの↓で次へ", async ({ page }) => {
  await passGate(page);
  const first = await activeId(page);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(700);
  expect(await activeId(page)).not.toBe(first);
});

test("描画するのは前後1本まで（軽さ）", async ({ page }) => {
  await passGate(page);
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(600);
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(600);
  expect(await page.locator(".item").count()).toBeLessThanOrEqual(3);
});

test("この投稿者を表示しない → フィードから消え、設定から戻せる", async ({ page }) => {
  await passGate(page);
  const handle = (await page.locator(".item.active .vinfo .h").textContent())!.replace("@", "");
  await page.locator(".item.active").getByRole("button", { name: "その他" }).click();
  await page.getByRole("button", { name: "この投稿者を表示しない" }).click();
  await expect(page.getByRole("status")).toContainText("表示しません");
  await page.reload();
  await expect(page.locator(".item.active")).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await expect(page.locator(".item.active .vinfo .h")).not.toHaveText(`@${handle}`);
    await page.keyboard.press("ArrowDown"); await page.waitForTimeout(500);
  }
  await page.goto("/settings/blocks");
  await expect(page.getByText(`@${handle}`)).toBeVisible();
  await page.getByRole("button", { name: "表示する" }).click();
  await expect(page.getByText("表示しない投稿者はいません")).toBeVisible();
});
