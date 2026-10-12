import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const passGate = async (page: Page) => {
  await page.goto("/age-gate");
  await page.getByRole("button", { name: "はい、18歳以上です" }).click();
  await page.waitForURL(/\/$/);
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
    await page.locator(".item.active").getByRole("button", { name: "その他" }).click();
    await page.locator(".sheet").getByRole("button", { name: "通報" }).click();
    await page.getByRole("radio", { name: /未成年の疑い/ }).click();
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.getByRole("status")).toContainText("表示されません");
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

let adminSecret = "";

test.describe("権限", () => {
  test("管理画面はログインと2段階認証が必要", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.fill("#email", "admin@example.com");
    await page.fill("#password", "glow-admin-e2e");
    await page.getByRole("button", { name: /次へ/ }).click();
    await expect(page).toHaveURL(/\/admin\/mfa/);
    await page.goto("/admin/cases");
    await expect(page).toHaveURL(/\/admin\/mfa/);
    const secret = (await page.locator("code").textContent())!.trim();
    adminSecret = secret;
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

  test("登録すれば運営の承認なしですぐ投稿できる（アフィリエイトと同意が必須）", async ({ page }) => {
    await passGate(page);
    await page.goto("/login");
    await page.fill("#email", "viewer@demo.example");
    await page.fill("#password", "glow-demo-password");
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.waitForURL(/\/me$/);
    await page.goto("/creator/apply");

    // 確認事項をすべてチェックするまで、登録ボタンは押せない
    const submit = page.getByRole("button", { name: /登録して投稿をはじめる/ });
    await expect(submit).toBeDisabled();

    // 18歳以上の生年月日とアフィリエイトIDを入れる
    await page.fill("#birthDate", "1995-04-01");
    await page.getByLabel("アフィリエイトID 1").fill(`viewer-aff-${Date.now() % 100000}`);
    for (const c of await page.locator('input[name^="at."]').all()) await c.check({ force: true });
    await expect(submit).toBeEnabled();

    // 登録すると、運営の承認を挟まずそのまま投稿画面へ
    await submit.click();
    // 承認待ちの画面を挟まず、そのまま投稿画面（動画を選ぶ）に入れる
    await page.waitForURL(/\/creator\/new/);
    await expect(page.locator(".pick-main").first()).toBeVisible();
  });

  test("登録したアフィリエイトは本人では変えられない（追加だけできる）", async ({ page }) => {
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await page.goto("/settings/affiliates");
    // 既存の登録には「変更不可」と出る
    await expect(page.getByText("変更不可").first()).toBeVisible();
    // 追加はできる
    await page.getByLabel("アフィリエイトID").fill(`luna-extra-${Date.now() % 100000}`);
    await page.getByRole("button", { name: /追加する/ }).click();
    await expect(page.getByText("追加しました。")).toBeVisible();
  });
});

/** 「完全版を見る」のリンクは必須。承認済みの送客先を選んで自分のページのURLを入れる */
async function fillLink(page: Page) {
  const sel = page.getByLabel("送客先のサービス");
  const first = (await sel.locator("option").nth(1).getAttribute("value"))!;
  await sel.selectOption(first);
  // 表示は「サービス名（ドメイン）」。サービス名にも全角カッコが入るので、最後のカッコを使う
  const label = await sel.locator(`option[value="${first}"]`).innerText();
  const domain = [...label.matchAll(/（([^（）]+)）/g)].at(-1)![1];
  await page.getByLabel("自分のページのURL").fill(`https://${domain}/my/sample-${Date.now() % 100000}`);
}

async function addTag(page: Page, name: string) {
  const box = page.getByLabel("タグ", { exact: true });
  await box.fill(name);
  await box.press("Enter");
}

// 確認事項（4つ）をすべてチェックする
async function agreeAll(page: Page) {
  // 確認事項の各チェックボックス（四角いマーク）を押す。リンクを踏まないよう box を狙う
  const boxes = page.locator("label.check .box");
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).click();
}

/** 動画＝埋め込みの投稿画面に入り、許可済みの出どころ（example.com）の埋め込みURLを入れる */
async function startVideoEmbed(page: Page) {
  await page.goto("/creator/new");
  await expect(page.locator(".pick-main").first()).toBeVisible();
  await page.getByRole("button", { name: "動画を埋め込む" }).click();
  await expect(page.locator(".composer")).toBeVisible();
  await page.getByLabel("埋め込みURL").fill(`https://example.com/sample/${Date.now() % 100000}-${Math.floor(Math.random() * 10000)}`);
}

/** 写真の投稿画面に入り、画像を渡す（新しい入口：「写真を投稿」→ ファイル選択で内容画面へ） */
async function startPhotos(page: Page, files: string[]) {
  await page.goto("/creator/new");
  await expect(page.locator(".pick-main").first()).toBeVisible();
  await page.locator('input[aria-label="写真を選ぶ"]').setInputFiles(files);
  await expect(page.locator(".composer")).toBeVisible();
}

const CRON_SECRET = "e2e-cron-secret-0123456789";

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

test.describe("外部サービスとのつなぎ目", () => {
  test("定期処理は鍵がないと呼べない。正しい鍵で呼ぶと実行され、記録が残る", async ({ page }) => {
    const url = "/api/cron/purge";
    // 鍵なし／違う鍵は断る
    expect((await page.request.post(url)).status()).toBe(401);
    expect((await page.request.post(url, { headers: { authorization: "Bearer wrong-secret-0000000" } })).status()).toBe(401);
    // 正しい鍵なら実行される
    const ok = await page.request.post(url, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    expect(ok.status()).toBe(200);
    // 知らない仕事は404
    expect((await page.request.post("/api/cron/nope", { headers: { authorization: `Bearer ${CRON_SECRET}` } })).status()).toBe(404);
  });
});

test.describe("投稿（埋め込み・写真）と配信", () => {
  test("埋め込み動画：投稿するとフィードで埋め込み再生される", async ({ page }) => {
    test.setTimeout(60_000);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await startVideoEmbed(page);
    await page.getByRole("radio", { name: /女性/ }).click();
    const title = `埋め込みテスト${Date.now() % 100000}`;
    await page.fill('[aria-label="説明"]', title);
    await addTag(page, "ホテル");
    await fillLink(page);
    await agreeAll(page);
    await page.getByRole("button", { name: "投稿する" }).click();
    await page.waitForURL(/creator\/videos\?submitted=1/);

    const all: { title: string; id: string; embedUrl: string | null }[] = [];
    for (let off: number | null = 0; off !== null;) {
      const j = await (await page.request.get(`/api/v1/feed?tab=recommended&offset=${off}`)).json();
      all.push(...j.videos); off = j.nextOffset;
    }
    const v = all.find((x) => x.title === title)!;
    expect(v.embedUrl).toMatch(/^https:\/\/example\.com\/sample\//);

    await page.goto(`/?v=${v.id}`);
    // 埋め込みの iframe が表示される（自社に保存せず提携先から再生）
    await expect(page.locator(".item.active .fembed-frame")).toBeVisible();
    await expect(page.locator(".item.active").getByRole("button", { name: "いいね" })).toBeVisible();
  });

  test("安全でない埋め込みURL（https以外）は投稿できない", async ({ page }) => {
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await page.goto("/creator/new");
    await page.getByRole("button", { name: "動画を埋め込む" }).click();
    // 出どころは自由だが、URL自体の安全性（https等）はチェックする
    await page.getByLabel("埋め込みURL").fill("http://example.com/clip/1");
    await page.getByRole("radio", { name: /女性/ }).click();
    await page.fill('[aria-label="説明"]', `安全性${Date.now() % 10000}`);
    await addTag(page, "ホテル");
    await fillLink(page);
    await agreeAll(page);
    await page.getByRole("button", { name: "投稿する" }).click();
    // サーバーではじかれ、エラーが出る（投稿は作られない）
    await expect(page.getByText(/https/)).toBeVisible();
  });

  test("写真投稿：複数の画像を選んで投稿 → フィードで横スワイプで見られる", async ({ page }) => {
    test.skip(!hasFfmpeg, "ffmpeg が必要");
    test.setTimeout(120_000);
    const img1 = path.join(tmpdir(), `glow-e2e-p1-${process.pid}.jpg`);
    const img2 = path.join(tmpdir(), `glow-e2e-p2-${process.pid}.jpg`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=720x1280", "-frames:v", "1", img1]);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=1280x720", "-frames:v", "1", img2]);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await startPhotos(page, [img1, img2]);
    await expect(page.getByText(/写真 2 枚の準備ができました/)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".photo-item")).toHaveCount(2);

    const title = `写真テスト${Date.now() % 100000}`;
    await page.fill('[aria-label="説明"]', title);
    await addTag(page, "ホテル");
    await page.getByRole("radio", { name: /女性/ }).click();
    await fillLink(page);
    await agreeAll(page);
    await page.getByRole("button", { name: "投稿する" }).click();
    await page.waitForURL(/creator\/videos\?submitted=1/);

    const all: { title: string; id: string; kind: string; images: unknown[] }[] = [];
    for (let off: number | null = 0; off !== null;) {
      const j = await (await page.request.get(`/api/v1/feed?tab=recommended&offset=${off}`)).json();
      all.push(...j.videos); off = j.nextOffset;
    }
    const v = all.find((x) => x.title === title)!;
    expect(v.kind).toBe("photo");
    expect(v.images.length).toBe(2);

    await page.goto(`/?v=${v.id}`);
    await expect(page.locator(".item.active .photo-slide img")).toHaveCount(2);
    await expect(page.locator(".item.active").getByRole("button", { name: "いいね" })).toBeVisible();
    await expect(page.locator(".item.active .photo-count")).toHaveText("1/2");
    // 「全画面で見る」ボタンで、写真を切らずに全体表示できる
    await page.locator(".item.active").getByRole("button", { name: "全画面で見る" }).click();
    await expect(page.locator(".photo-fs")).toBeVisible();
    await expect(page.locator(".photo-fs-slide img")).toHaveCount(2);
  });

  test("写真の下書き：保存して、続きから開くと写真が戻る", async ({ page }) => {
    test.skip(!hasFfmpeg, "ffmpeg が必要");
    test.setTimeout(120_000);
    const a = path.join(tmpdir(), `glow-e2e-pd1-${process.pid}.jpg`);
    const b = path.join(tmpdir(), `glow-e2e-pd2-${process.pid}.jpg`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=green:s=720x1280", "-frames:v", "1", a]);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=orange:s=720x1280", "-frames:v", "1", b]);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await startPhotos(page, [a, b]);
    await expect(page.getByText(/写真 2 枚の準備ができました/)).toBeVisible({ timeout: 30_000 });
    const cap = `写真下書き${Date.now() % 100000}`;
    await page.fill('[aria-label="説明"]', cap);
    await page.getByRole("button", { name: "下書き保存" }).click();
    await page.waitForURL(/creator\/videos\?saved=1/);

    // 続きから開くと、写真2枚と説明が戻っている
    await page.goto("/creator/new");
    await page.locator(".draft-card").first().click();
    await expect(page.locator(".composer")).toBeVisible();
    await expect(page.locator(".photo-item")).toHaveCount(2);
    await expect(page.locator('[aria-label="説明"]')).toHaveValue(cap);

    await page.getByRole("radio", { name: /女性/ }).click();
    await addTag(page, "ホテル");
    await fillLink(page);
    await agreeAll(page);
    await page.getByRole("button", { name: "投稿する" }).click();
    await page.waitForURL(/creator\/videos\?submitted=1/);
  });

  test("投稿画面：下書き保存・公開範囲・コメント許可（埋め込み）", async ({ page }) => {
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await startVideoEmbed(page);

    // 公開範囲とコメント許可は切り替えられる
    const mine = page.getByRole("radio", { name: "自分だけ" });
    await mine.click();
    await expect(mine).toHaveAttribute("aria-checked", "true");
    const sw = page.getByRole("button", { name: "コメントを許可" });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-pressed", "false");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-pressed", "true");

    // 内容が途中でも下書きとして保存できる
    await page.fill('[aria-label="説明"]', `下書きテスト${Date.now() % 100000}`);
    await page.getByRole("button", { name: "下書き保存" }).click();
    await page.waitForURL(/creator\/videos\?saved=1/);

    // 投稿画面に戻ると下書きが一覧に出て、続きから書ける（内容が戻っている）
    await page.goto("/creator/new");
    await expect(page.locator(".pick-main").first()).toBeVisible();
    await page.locator(".draft-card").first().click();
    await expect(page.locator(".composer")).toBeVisible();
    await expect(page.locator('[aria-label="説明"]')).toHaveValue(/下書きテスト/);
    await expect(page.getByRole("radio", { name: "自分だけ" })).toHaveAttribute("aria-checked", "true");

    // 続きを書いて投稿すると、下書きではなくなる
    await page.getByRole("radio", { name: /女性/ }).click();
    await addTag(page, "ホテル");
    await fillLink(page);
    await agreeAll(page);
    await page.getByRole("button", { name: "投稿する" }).click();
    await page.waitForURL(/creator\/videos\?submitted=1/);
  });

  test("投稿画面：タグを自分で自由に付けられる（候補なし・即時）", async ({ page }) => {
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await startVideoEmbed(page);
    const box = page.getByLabel("タグ", { exact: true });

    // 自分で打って「追加」で付く
    const mine = `夜景デート${Date.now() % 10000}`;
    await box.fill(mine);
    await page.getByRole("button", { name: new RegExp(`「${mine}」を追加`) }).click();
    await expect(page.locator(".taginput .chip.on")).toHaveCount(1);

    // Enter でも足せる
    await box.fill("ゆったり");
    await box.press("Enter");
    await expect(page.locator(".taginput .chip.on")).toHaveCount(2);

    // 外せる
    await page.getByRole("button", { name: "ゆったり を外す" }).click();
    await expect(page.locator(".taginput .chip.on")).toHaveCount(1);
  });

  test("リンクがないと投稿できない（サンプル＋販売ページが条件）", async ({ page }) => {
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await startVideoEmbed(page);

    // リンク以外をすべて埋めても、提出はできないまま
    await page.fill('[aria-label="説明"]', `リンク必須テスト${Date.now() % 10000}`);
    await addTag(page, "ホテル");
    await page.getByRole("radio", { name: /女性/ }).click();
    await agreeAll(page);
    const submit = page.getByRole("button", { name: "投稿する" });
    await expect(submit).toBeDisabled();

    // 販売ページのURLを入れると提出できるようになる
    await fillLink(page);
    await expect(submit).toBeEnabled();
  });
});

async function loginAs(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "glow-demo-password");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/me$/);
}

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
