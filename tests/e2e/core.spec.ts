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
});

const hasFfmpeg = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

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

  test("投稿者がアップロード → HLS（複数の画質）に変換 → 審査で公開 → 横長は切らずに表示", async ({ page, browser }) => {
    test.skip(!hasFfmpeg || !adminSecret, "ffmpeg と管理者の2段階認証（前のテスト）が必要");
    test.setTimeout(150_000);
    // 日本語や全角カッコを含むパスだとファイル選択に渡せないことがあるため、一時フォルダに作る
    const file = path.join(tmpdir(), `glow-e2e-landscape-${process.pid}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "gradients=s=1280x720:d=4:speed=0.05", "-f", "lavfi", "-i", "sine=f=330:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file]);
    await passGate(page);
    await loginAs(page, "luna_night@demo.example");
    await page.goto("/creator/new");
    await expect(page.locator(".uploader[data-ready]")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText("動画の準備ができました")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("radio", { name: /女性/ }).click();
    await page.getByRole("radio", { name: "ソフト" }).click();
    const title = `横長テスト${Date.now() % 100000}`;
    await page.fill("#title", title);
    await page.locator("button.chip").first().click();
    for (const t of ["自分が撮影・出演し", "出演者全員が18歳以上", "他人の動画の転載"]) await page.getByText(t).click();
    await page.getByRole("button", { name: "審査に提出" }).click();
    await page.waitForURL(/creator\/videos\?submitted=1/);

    const admin = await browser.newPage();
    await admin.goto("/admin/login");
    await admin.fill("#email", "admin@example.com");
    await admin.fill("#password", "glow-admin-e2e");
    await admin.getByRole("button", { name: /次へ/ }).click();
    await admin.fill('[aria-label="6桁のコード"]', totp(adminSecret));
    await admin.getByRole("button", { name: "確認" }).click();
    await admin.waitForURL(/\/admin$/);
    await admin.goto("/admin/reviews");
    const card = admin.locator(".card", { hasText: title });
    await expect(card.locator("video")).toHaveCount(1); // 審査画面で動画を確認できる
    await card.getByRole("button", { name: "承認して公開" }).click();
    await expect(admin.locator(".card", { hasText: title })).toHaveCount(0);
    await admin.close();

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
    await expect(page.locator(".item.active video.fv")).toHaveClass(/contain/);
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
