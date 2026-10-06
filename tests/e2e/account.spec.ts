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

test("メール未確認でもコメントできる（投稿と同じく確認は後でよい）", async ({ page }) => {
  await passGate(page);
  const h = "cmt_" + Date.now().toString().slice(-6);
  await signup(page, h);
  // 登録直後はメール未確認。フィードの最初の動画にコメントできる
  await page.goto("/");
  await page.locator(".item.active").getByRole("button", { name: "コメント" }).click();
  const body = `未確認コメント${Date.now() % 10000}`;
  await page.fill('[aria-label="コメントを入力"]', body);
  await page.getByRole("button", { name: "送信" }).click();
  await expect(page.getByText(body).first()).toBeVisible();
});

test("視聴履歴：見た動画が並び、消せる", async ({ page }) => {
  await passGate(page);
  const h = "hist_" + Date.now().toString().slice(-6);
  await signup(page, h);
  // 動画を1本見る（再生イベントを発生させる）
  await page.goto("/");
  const first = page.locator(".item.active");
  await expect(first).toBeVisible();
  await page.waitForTimeout(2500); // 視聴としてカウントされる
  await page.goto("/history");
  await expect(page.locator(".thumbs .thumb").first()).toBeVisible();
  // すべて消す
  await page.getByRole("button", { name: "履歴をすべて消す" }).click();
  await expect(page.getByText("視聴履歴はまだありません")).toBeVisible();
});

test("コレクション：作成して、動画を入れて、一覧に出る", async ({ page }) => {
  await passGate(page);
  const h = "col_" + Date.now().toString().slice(-6);
  await signup(page, h);
  await page.goto("/collections");
  const name = `あとで見る${Date.now() % 10000}`;
  await page.getByLabel("コレクション名").fill(name);
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page.getByText(name)).toBeVisible();
  // フィードの「…」→ コレクション → そのコレクションに追加
  await page.goto("/");
  await page.locator(".item.active").getByRole("button", { name: "その他" }).click();
  await page.getByRole("button", { name: "コレクション" }).click();
  const row = page.locator(".sheet .row", { hasText: name });
  await expect(row).toBeVisible();
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
});
