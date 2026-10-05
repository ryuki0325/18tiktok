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

test("ホーム画面に追加の案内：「あとで」で閉じると出てこない", async ({ page }) => {
  await passGate(page);
  await page.goto("/?a2hs=1");
  const banner = page.getByRole("dialog", { name: "ホーム画面に追加" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "閉じる" }).click();
  await expect(banner).toHaveCount(0);
  // 閉じたあとは、ふつうに開いても出てこない
  await page.goto("/");
  await page.waitForTimeout(500);
  await expect(page.locator(".a2hs")).toHaveCount(0);
});

test("iPhone では「追加」で手順が出る", async ({ page }) => {
  await passGate(page);
  await page.goto("/?a2hs=1");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "ホーム画面に追加する手順" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("共有ボタン")).toBeVisible();
  // 手順を開いている間はバナーを隠す（重ならないように）
  await expect(page.locator(".a2hs")).toHaveCount(0);
});

test.describe("ホーム画面から開いたとき", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const mm = window.matchMedia.bind(window);
      Object.defineProperty(window, "matchMedia", {
        value: (q: string) => (q.includes("display-mode: standalone")
          ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
          : mm(q)),
      });
      Object.defineProperty(navigator, "standalone", { value: true });
    });
  });

  test("起動画面が出て、案内は出さず、アプリ用の余白になる", async ({ page }) => {
    await passGate(page);
    await page.goto("/?a2hs=1");
    await expect(page.locator("html")).toHaveClass(/standalone/);
    // 起動画面は最初のHTMLに入っている（白い画面のちらつきを防ぐ）
    await expect(page.locator("#splash")).toHaveCount(1);
    await expect(page.locator("#splash")).toHaveClass(/off/);
    // すでに追加済みなので案内は出さない
    await expect(page.locator(".a2hs")).toHaveCount(0);
    await expect(page.locator(".item.active")).toBeVisible();
  });
});

const login = async (page: Page, email = "luna_night@demo.example") => {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "glow-demo-password");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/me$/);
};

test.describe("マイページ（プロフィール）", () => {
  test("TikTok と同じ並び：アイコン・@名前・3つの数字・編集ボタン・タブ", async ({ page }) => {
    await passGate(page);
    await login(page);
    await expect(page.getByRole("heading", { name: "@luna_night" })).toBeVisible();
    for (const k of ["フォロー中", "フォロワー", "いいね"]) await expect(page.getByText(k, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "プロフィールを編集" })).toBeVisible();
    // 投稿タブに自分の動画が並ぶ（再生数つき）
    // ほかのテストが動画を増やすことがあるので、最低2本あることだけ確かめる
    expect(await page.locator(".thumbs .thumb").count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator(".thumb .meta").first()).toBeVisible();
  });

  test("タブを切り替えると、保存・いいね・非公開が見られる", async ({ page }) => {
    await passGate(page);
    await login(page);
    await page.getByRole("tab", { name: "保存した動画" }).click();
    await expect(page.getByText("保存した動画はまだありません")).toBeVisible();
    await page.getByRole("tab", { name: "いいねした動画" }).click();
    await expect(page.getByText("いいねした動画はまだありません")).toBeVisible();
    // 非公開タブ（審査中・差し戻し・自分で非公開にしたもの）。ほかのテストの影響で中身は変わるので、開けることだけ確かめる
    await page.getByRole("tab", { name: "非公開" }).click();
    await expect(page.getByRole("tab", { name: "非公開" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".prof-body")).toBeVisible();
  });

  test("プロフィールを編集して保存できる。ユーザー名の重複は断る", async ({ page }) => {
    await passGate(page);
    await login(page);
    await page.getByRole("link", { name: "プロフィールを編集" }).click();
    await page.waitForURL(/\/me\/edit/);
    await page.fill("#bio", "テスト用の自己紹介です");
    await page.fill("#displayName", "ルナ");
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByText("プロフィールを保存しました")).toBeVisible();
    await page.goto("/me");
    await expect(page.getByText("テスト用の自己紹介です")).toBeVisible();
    // ほかの人が使っているユーザー名には変えられない
    await page.goto("/me/edit");
    await page.fill("#handle", "aoi_lounge");
    await page.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByText("すでに使われています")).toBeVisible();
  });

  test("他人のプロフィールからフォローでき、フォロワー一覧に出る", async ({ page }) => {
    await passGate(page);
    await login(page, "viewer@demo.example");
    await page.goto("/u/aoi_lounge");
    await expect(page.getByRole("heading", { name: "@aoi_lounge" })).toBeVisible();
    await page.getByRole("button", { name: "フォロー", exact: true }).click();
    await expect(page.getByRole("button", { name: "フォロー中" })).toBeVisible();
    await page.goto("/me/people?tab=following");
    await expect(page.getByRole("link", { name: "@aoi_lounge" }).first()).toBeVisible();
    // 相手側のフォロワー一覧にも出る
    await page.goto("/u/aoi_lounge/people");
    await expect(page.getByRole("link", { name: "@night_owl" }).first()).toBeVisible();
  });

  test("ログインしていなくても、この端末の保存・いいねは見られる", async ({ page }) => {
    await passGate(page);
    await page.locator(".item.active").getByRole("button", { name: "いいね" }).click();
    await page.goto("/me?tab=liked");
    await expect(page.getByText("ログインしていません")).toBeVisible();
    await expect(page.locator(".thumbs .thumb")).toHaveCount(1);
  });
});

test.describe("コメント（返信といいね）", () => {
  test("返信するとぶら下がり、コメントにいいねできる", async ({ page }) => {
    await passGate(page);
    await login(page, "viewer@demo.example");
    await page.goto("/");
    await page.locator(".item.active").getByRole("button", { name: "コメント" }).click();
    const first = page.locator(".cmt").first();
    await expect(first).toBeVisible();
    // いいね
    await first.locator(".cmt-like").click();
    await expect(first.locator(".cmt-like")).toHaveAttribute("aria-pressed", "true");
    // 返信
    await first.getByRole("button", { name: "返信" }).click();
    await expect(page.getByText(/に返信中/)).toBeVisible();
    await page.fill('[aria-label="コメントを入力"]', "返信のテスト");
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.locator(".cmt.reply").getByText("返信のテスト")).toBeVisible();
  });

  test("コメントされると、動画の投稿者にお知らせが届く", async ({ page }) => {
    await passGate(page);
    await login(page, "viewer@demo.example");
    await page.goto("/");
    const handle = (await page.locator(".item.active .vinfo .h").textContent())!.replace("@", "");
    await page.locator(".item.active").getByRole("button", { name: "コメント" }).click();
    await page.fill('[aria-label="コメントを入力"]', `お知らせのテスト${Date.now() % 10000}`);
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.locator(".cmt").first()).toContainText("お知らせのテスト");
    // 投稿者としてログインし直すと、受信箱に届いている
    await login(page, `${handle.replace(/\W/g, "")}@demo.example`);
    await page.goto("/notifications");
    await expect(page.getByText(/さんがコメントしました/).first()).toBeVisible();
  });
});

test("検索はタブで絞り込める", async ({ page }) => {
  await passGate(page);
  await page.goto("/search?q=luna");
  await page.getByRole("tab", { name: "ユーザー" }).click();
  await expect(page.getByRole("link", { name: "@luna_night" }).first()).toBeVisible();
  await page.getByRole("tab", { name: "タグ" }).click();
  await expect(page.getByText("一致するものはありません")).toBeVisible();
});
