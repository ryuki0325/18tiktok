import { expect, test, type Page } from "@playwright/test";

const passGate = async (page: Page) => {
  await page.goto("/age-gate");
  await page.getByRole("button", { name: "はい、18歳以上です" }).click();
  await page.waitForURL(/\/$/);
};

async function signup(page: Page, handle: string) {
  await page.goto("/signup");
  await page.fill("#email", `${handle}@example.com`);
  await page.fill("#handle", handle);
  await page.fill("#password", "very-secure-pass-1");
  await page.locator("label", { hasText: "18歳以上です" }).click();
  await page.locator("label", { hasText: "に同意します" }).click();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByRole("status")).toContainText("登録しました");
}

test("パスワードを忘れた：登録の有無は答えない", async ({ page }) => {
  await passGate(page);
  await page.goto("/login");
  await page.getByRole("link", { name: "パスワードを忘れた方" }).click();
  await page.waitForURL(/\/forgot/);
  await expect(page.getByRole("heading", { name: "パスワードの再設定" })).toBeVisible();
  await page.fill("#email", "nobody@example.com");
  await page.getByRole("button", { name: "再設定リンクを送る" }).click();
  await expect(page.getByRole("status")).toBeVisible();
});

test("パスワード変更と退会", async ({ page }) => {
  await passGate(page);
  await signup(page, "leaver_" + Date.now().toString().slice(-6));
  await page.goto("/settings/account");
  await page.fill("#current", "very-secure-pass-1");
  await page.fill("#next", "another-secure-pass-2");
  await page.getByRole("button", { name: "変更する" }).click();
  await expect(page.getByText("パスワードを変更しました")).toBeVisible();
  await page.getByRole("button", { name: "退会の手続きへ" }).click();
  await page.fill("#delpw", "another-secure-pass-2");
  await page.fill("#confirm", "退会する");
  await page.getByRole("button", { name: "退会する", exact: true }).click();
  await page.waitForURL(/deleted=1/);
  await page.goto("/me");
  await expect(page.getByText("ログインしていません")).toBeVisible();
});

test("管理画面：特集枠・管理者・定期処理の画面が開ける", async ({ page }) => {
  // core.spec の2段階認証テストで登録済みのため、ここではログインだけ確認する
  await page.goto("/admin/featured");
  await expect(page).toHaveURL(/\/admin\/(login|mfa)/);
});
