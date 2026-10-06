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
    await expect(page.locator(".pick-main")).toBeVisible();
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

const CRON_SECRET = "e2e-cron-secret-0123456789";
const WEBHOOK_SECRET = "e2e-bunny-hook-0123456789";

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

  test("Bunny の Webhook は鍵がないと受け付けない", async ({ page }) => {
    const url = "/api/v1/webhooks/bunny";
    const guid = "00000000-0000-4000-8000-000000000000";
    expect((await page.request.post(url, { data: { VideoGuid: guid } })).status()).toBe(401);
    expect((await page.request.post(`${url}?t=wrong`, { data: { VideoGuid: guid } })).status()).toBe(401);
    // 正しい鍵でも、中身は信用せず GUID で問い合わせ直すだけ（知らない GUID は何もしない）
    const ok = await page.request.post(`${url}?t=${WEBHOOK_SECRET}`, { data: { VideoGuid: guid } });
    expect(ok.status()).toBe(200);
    // 形が違う GUID は断る
    expect((await page.request.post(`${url}?t=${WEBHOOK_SECRET}`, { data: { VideoGuid: "../etc/passwd" } })).status()).toBe(400);
  });
});

test.describe("動画のアップロードと配信", () => {
  test("分割アップロード（tus）：位置がずれたチャンクは拒否され、HEADで続きの位置が分かる", async ({ page }) => {
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    const size = 300 * 1024;
    const init = await page.request.post("/api/v1/uploads", { headers: { origin: "http://localhost:3200" }, data: { filename: "a.mp4", mime: "video/mp4", size } });
    expect(init.status()).toBe(201);
    const { id, tus } = await init.json();
    expect(tus.chunkSize).toBe(128 * 1024);
    const url = `/api/v1/uploads/${id}/tus`;
    const h = { origin: "http://localhost:3200", "Tus-Resumable": "1.0.0", "Content-Type": "application/offset+octet-stream" };
    // 先頭はMP4のしるし（ftyp）にする。でないと「動画ではない」として弾かれる
    const chunk = Buffer.alloc(tus.chunkSize, 1);
    Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]).copy(chunk, 0);
    expect((await page.request.patch(url, { headers: { ...h, "Upload-Offset": "0" }, data: chunk })).status()).toBe(204);
    // 同じ位置をもう一度送る（通信が切れて再送した想定）→ 409 と正しい位置
    const dup = await page.request.patch(url, { headers: { ...h, "Upload-Offset": "0" }, data: chunk });
    expect(dup.status()).toBe(409);
    expect(dup.headers()["upload-offset"]).toBe(String(tus.chunkSize));
    const head = await page.request.head(url, { headers: { "Tus-Resumable": "1.0.0" } });
    expect(head.headers()["upload-offset"]).toBe(String(tus.chunkSize));
    // 途中で完了させようとしても受け付けない
    expect((await page.request.post(`/api/v1/uploads/${id}/complete`, { headers: { origin: "http://localhost:3200" }, data: {} })).status()).toBe(409);
    // 動画でないファイルは、中身を見て弾く（MIMEの自己申告は信用しない）
    const bad = await page.request.post("/api/v1/uploads", { headers: { origin: "http://localhost:3200" }, data: { filename: "evil.mp4", mime: "video/mp4", size: 1024 } });
    const badId = (await bad.json()).id;
    const badRes = await page.request.patch(`/api/v1/uploads/${badId}/tus`, {
      headers: { ...h, "Upload-Offset": "0" }, data: Buffer.from("<?php system($_GET[0]); ?>".padEnd(64, " ")),
    });
    expect(badRes.status()).toBe(415);

    // 他人は触れない
    const other = await page.context().browser()!.newContext();
    const o = await other.newPage();
    expect((await o.request.head(`http://localhost:3200${url}`)).status()).toBe(401);
    await other.close();
  });

  test("投稿者がアップロード → HLS（複数の画質）に変換 → 審査で公開 → 横長は切らずに表示", async ({ page }) => {
    test.skip(!hasFfmpeg, "ffmpeg が必要");
    test.setTimeout(150_000);
    // 日本語や全角カッコを含むパスだとファイル選択に渡せないことがあるため、一時フォルダに作る
    const file = path.join(tmpdir(), `glow-e2e-landscape-${process.pid}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "gradients=s=1280x720:d=4:speed=0.05", "-f", "lavfi", "-i", "sine=f=330:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file]);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await page.goto("/creator/new");
    // 1) 動画を選ぶ画面 → 選ぶと 2) 内容を書く画面に切り替わり、裏で送信が進む
    await expect(page.locator(".pick-main")).toBeVisible();
    await page.locator('input[aria-label="動画・写真を選ぶ"]').setInputFiles(file);
    await expect(page.locator(".composer")).toBeVisible();
    await expect(page.getByText("動画の準備ができました")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("radio", { name: /女性/ }).click();
    const title = `横長テスト${Date.now() % 100000}`;
    await page.fill('[aria-label="説明"]', title);
    await addTag(page, "ホテル");
    await fillLink(page);
    await agreeAll(page);
    await page.getByRole("button", { name: "投稿する" }).click();
    await page.waitForURL(/creator\/videos\?submitted=1/);

    const all: { title: string; id: string; src: string; width: number; height: number; poster: string }[] = [];
    for (let off: number | null = 0; off !== null;) {
      const j = await (await page.request.get(`/api/v1/feed?tab=recommended&offset=${off}`)).json();
      all.push(...j.videos);
      off = j.nextOffset;
    }
    const v = all.find((x) => x.title === title)!;
    expect(v.src).toMatch(/\/media\/[0-9a-f-]+\/master\.m3u8$/);
    expect([v.width, v.height]).toEqual([1280, 720]);
    expect(v.poster).toMatch(/poster\.jpg$/);
    const master = await (await page.request.get(v.src)).text();
    expect(master.match(/#EXT-X-STREAM-INF/g)!.length).toBeGreaterThanOrEqual(3); // 360p / 540p / 720p
    const rendition = await (await page.request.get(v.src.replace("master.m3u8", "360p/index.m3u8"))).text();
    expect(rendition).toContain("#EXT-X-TARGETDURATION:2");
    const seg = await page.request.get(v.src.replace("master.m3u8", "360p/s0000.ts"), { headers: { range: "bytes=0-99" } });
    expect(seg.status()).toBe(206);

    await page.goto(`/?v=${v.id}`);
    // 横長の動画は、ふだん（縦持ち）は切らずに全体を見せる（fv-land=contain）
    await expect(page.locator(".item.active video.fv")).toHaveClass(/fv-land/);
  });

  test("スマホを横に倒すと、横長の動画が画面いっぱいになる（いいね等は縦と同じ）", async ({ page }) => {
    test.skip(!hasFfmpeg, "ffmpeg が必要");
    test.setTimeout(150_000);
    const file = path.join(tmpdir(), `glow-e2e-rotate-${process.pid}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "gradients=s=1280x720:d=4:speed=0.05", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await page.goto("/creator/new");
    await page.locator('input[aria-label="動画・写真を選ぶ"]').setInputFiles(file);
    await expect(page.getByText("動画の準備ができました")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("radio", { name: /女性/ }).click();
    const title = `回転テスト${Date.now() % 100000}`;
    await page.fill('[aria-label="説明"]', title);
    await addTag(page, "ホテル");
    await fillLink(page);
    await agreeAll(page);
    await page.getByRole("button", { name: "投稿する" }).click();
    await page.waitForURL(/creator\/videos\?submitted=1/);

    const all: { title: string; id: string }[] = [];
    for (let off: number | null = 0; off !== null;) {
      const j = await (await page.request.get(`/api/v1/feed?tab=recommended&offset=${off}`)).json();
      all.push(...j.videos); off = j.nextOffset;
    }
    const v = all.find((x) => x.title === title)!;
    const fit = async () => page.locator(".item.active video.fv").evaluate((el) => getComputedStyle(el).objectFit);

    // 縦持ち（高さのほうが大きい）→ 切らずに全体
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?v=${v.id}`);
    await expect(page.locator(".item.active video.fv")).toHaveClass(/fv-land/);
    expect(await fit()).toBe("contain");
    // ボタン（いいね等）は出ている
    await expect(page.locator(".item.active").getByRole("button", { name: "いいね" })).toBeVisible();

    // 横に倒す（幅のほうが大きく、高さが低い）→ 画面いっぱい
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(fit).toBe("cover");
    // いいね等のボタンは横持ちでも同じく出ている
    await expect(page.locator(".item.active").getByRole("button", { name: "いいね" })).toBeVisible();
  });

  test("写真投稿：複数の画像を選んで投稿 → 審査で公開 → フィードで横スワイプで見られる", async ({ page }) => {
    test.skip(!hasFfmpeg, "ffmpeg が必要");
    test.setTimeout(150_000);
    const img1 = path.join(tmpdir(), `glow-e2e-p1-${process.pid}.jpg`);
    const img2 = path.join(tmpdir(), `glow-e2e-p2-${process.pid}.jpg`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=720x1280", "-frames:v", "1", img1]);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=1280x720", "-frames:v", "1", img2]);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await page.goto("/creator/new");
    // 動画・写真の選択に、画像を2枚渡す → 写真モードになる
    await page.locator('input[aria-label="動画・写真を選ぶ"]').setInputFiles([img1, img2]);
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

    // フィードで、写真が2枚横に並んでいて、いいね等のボタンも出る
    await page.goto(`/?v=${v.id}`);
    await expect(page.locator(".item.active .photo-slide img")).toHaveCount(2);
    await expect(page.locator(".item.active").getByRole("button", { name: "いいね" })).toBeVisible();
    await expect(page.locator(".item.active .photo-dots")).toBeVisible();
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
    await page.goto("/creator/new");
    await page.locator('input[aria-label="動画・写真を選ぶ"]').setInputFiles([a, b]);
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

    // そのまま審査に出せる（写真が復元されているので動画扱いにならない）
    await page.getByRole("radio", { name: /女性/ }).click();
    await addTag(page, "ホテル");
    await fillLink(page);
    await agreeAll(page);
    await page.getByRole("button", { name: "投稿する" }).click();
    await page.waitForURL(/creator\/videos\?submitted=1/);
    await expect(page.getByRole("button", { name: "続きを書く" })).toHaveCount(0);
  });

  test("投稿画面：下書き保存・公開範囲・コメント許可・表紙選び", async ({ page }) => {
    test.skip(!hasFfmpeg, "ffmpeg が必要");
    test.setTimeout(150_000);
    const file = path.join(tmpdir(), `glow-e2e-compose-${process.pid}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=540x960:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await page.goto("/creator/new");
    await page.locator('input[aria-label="動画・写真を選ぶ"]').setInputFiles(file);
    await expect(page.getByText("動画の準備ができました")).toBeVisible({ timeout: 90_000 });

    // 公開範囲とコメント許可は切り替えられる
    const mine = page.getByRole("radio", { name: "自分だけ" });
    await mine.click();
    await expect(mine).toHaveAttribute("aria-checked", "true");
    const sw = page.getByRole("button", { name: "コメントを許可" });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-pressed", "false");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-pressed", "true");

    // 表紙を選ぶシートが開き、位置を選んで決められる
    await page.locator(".cover-btn").click();
    const sheet = page.getByRole("dialog", { name: "表紙を選ぶ" });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.cover-strip [role="radio"]').first()).toBeVisible({ timeout: 20_000 });
    await sheet.locator('.cover-strip [role="radio"]').nth(2).click();
    await sheet.getByRole("button", { name: "この表紙にする" }).click();
    await expect(sheet).toHaveCount(0);

    // 内容が途中でも下書きとして保存できる
    await page.fill('[aria-label="説明"]', `下書きテスト${Date.now() % 100000}`);
    await page.getByRole("button", { name: "下書き保存" }).click();
    await page.waitForURL(/creator\/videos\?saved=1/);

    // 投稿画面に戻ると下書きが一覧に出て、続きから書ける（内容が戻っている）
    await page.goto("/creator/new");
    await expect(page.locator(".pick-main")).toBeVisible();
    await page.locator(".draft-card").first().click();
    await expect(page.locator(".composer")).toBeVisible();
    await expect(page.locator('[aria-label="説明"]')).toHaveValue(/下書きテスト/);
    await expect(page.getByRole("radio", { name: "自分だけ" })).toHaveAttribute("aria-checked", "true");

    // 続きを書いて審査に出すと、下書きではなく審査待ちになる（新しい動画が増えない）
    await page.getByRole("radio", { name: /女性/ }).click();
    await addTag(page, "ホテル");
    await fillLink(page);
    await agreeAll(page);
    await page.getByRole("button", { name: "投稿する" }).click();
    await page.waitForURL(/creator\/videos\?submitted=1/);
    await expect(page.getByRole("button", { name: "続きを書く" })).toHaveCount(0);
  });

  test("投稿画面：長さを切り取ると、実際に短い動画になる", async ({ page }) => {
    test.skip(!hasFfmpeg, "ffmpeg が必要");
    test.setTimeout(180_000);
    const file = path.join(tmpdir(), `glow-e2e-trim-${process.pid}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=540x960:d=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "30", file]);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await page.goto("/creator/new");
    await page.locator('input[aria-label="動画・写真を選ぶ"]').setInputFiles(file);
    await expect(page.getByText("動画の準備ができました")).toBeVisible({ timeout: 120_000 });

    // 切り取る前の長さを控えておく
    const idA = await page.locator('input[name="uploadId"]').inputValue();
    const before = (await (await page.request.get(`/api/v1/uploads/${idA}`)).json()).durationMs as number;
    expect(before).toBeGreaterThan(8000);

    await page.getByRole("button", { name: /長さを切り取る/ }).click();
    const sheet = page.getByRole("dialog", { name: "長さを切り取る" });
    await expect(sheet).toBeVisible();
    // 終わりのつまみをキーボードで手前に動かす（Shift+← は1秒ずつ）
    const right = sheet.getByRole("slider", { name: "終わりの位置" });
    await right.focus();
    for (let i = 0; i < 6; i++) await right.press("Shift+ArrowLeft");
    await expect(sheet.getByText(/になります/)).toBeVisible();
    await sheet.getByRole("button", { name: "この長さにする" }).click();
    await expect(sheet).toHaveCount(0);

    // 変換し直され、実際に短くなる（再生用の動画そのものが短い）
    const row = async () => (await (await page.request.get(`/api/v1/uploads/${idA}`)).json()) as { status: string; durationMs: number; trimStartMs: number | null; trimEndMs: number | null };
    const saved = await row();
    expect(saved.trimStartMs).toBe(0);
    expect(saved.trimEndMs).toBeLessThan(6000);
    await expect.poll(async () => (await row()).status, { timeout: 120_000, intervals: [500] }).toBe("ready");
    const after = (await row()).durationMs;
    expect(after).toBeLessThan(before - 4000);
    const master = await (await page.request.get(`/media/${idA}/master.m3u8`)).text();
    const first = master.split("\n").find((l) => l.endsWith("index.m3u8"))!;
    const idx = await (await page.request.get(`/media/${idA}/${first}`)).text();
    const total = [...idx.matchAll(/#EXTINF:([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(total).toBeLessThan(before / 1000 - 3);
    await expect(page.getByRole("button", { name: /秒に切り取り済み/ })).toBeVisible();
  });

  test("投稿画面：タグを自分で自由に付けられる（候補なし・即時）", async ({ page }) => {
    test.skip(!hasFfmpeg, "ffmpeg が必要");
    test.setTimeout(150_000);
    const file = path.join(tmpdir(), `glow-e2e-tag-${process.pid}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=540x960:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await page.goto("/creator/new");
    await page.locator('input[aria-label="動画・写真を選ぶ"]').setInputFiles(file);
    await expect(page.locator(".composer")).toBeVisible();
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

  test("リンクがないと投稿できない（サンプル動画＋販売ページが条件）", async ({ page }) => {
    test.skip(!hasFfmpeg, "ffmpeg が必要");
    test.setTimeout(150_000);
    const file = path.join(tmpdir(), `glow-e2e-link-${process.pid}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=540x960:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await page.goto("/creator/new");
    await page.locator('input[aria-label="動画・写真を選ぶ"]').setInputFiles(file);
    await expect(page.getByText("動画の準備ができました")).toBeVisible({ timeout: 120_000 });

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

  test("送りかけの動画は、ページを開き直しても続きから送れる", async ({ page }) => {
    test.skip(!hasFfmpeg, "ffmpeg が必要");
    test.setTimeout(120_000);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");

    // 途中まで送った状態を作る（1チャンクだけ送って置いておく）
    const size = 300 * 1024;
    const init = await page.request.post("/api/v1/uploads", { headers: { origin: "http://localhost:3200" }, data: { filename: "のこり.mp4", mime: "video/mp4", size } });
    const { id, tus } = await init.json();
    const chunk = Buffer.alloc(tus.chunkSize, 1);
    Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]).copy(chunk, 0);
    await page.request.patch(`/api/v1/uploads/${id}/tus`, {
      headers: { origin: "http://localhost:3200", "Tus-Resumable": "1.0.0", "Content-Type": "application/offset+octet-stream", "Upload-Offset": "0" }, data: chunk,
    });
    // 端末が覚えている「続き」を、ブラウザの保存領域に置く
    await page.goto("/creator/new");
    await page.evaluate(([uid, fsize, csize]) => {
      localStorage.setItem("glow.uploads", JSON.stringify({
        [`のこり.mp4|${fsize}|1700000000000`]: {
          id: uid, provider: "local", location: `${location.origin}/api/v1/uploads/${uid}/tus`,
          tus: { endpoint: `/api/v1/uploads/${uid}/tus`, headers: {}, metadata: {}, chunkSize: csize }, at: Date.now(),
        },
      }));
    }, [id, size, tus.chunkSize] as const);

    await page.reload();
    await expect(page.getByText("送りかけの動画があります")).toBeVisible();
    await expect(page.getByText(/のこり\.mp4（4[0-9]% まで送信済み）/)).toBeVisible();

    // 「やめる」で覚えている続きを捨てられる
    await page.getByRole("button", { name: "やめる" }).click();
    await expect(page.getByText("送りかけの動画があります")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("送りかけの動画があります")).toHaveCount(0);
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
