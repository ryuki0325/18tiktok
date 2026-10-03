import { describe, expect, it } from "vitest";
import { checkAffiliateUrl, containsUrl, registrableDomain } from "@/lib/url";
import { autoFix, contrast, contrastWarnings, parsePref, PRESETS, tokensFor, videoTokens } from "@/lib/theme";
import { base32Decode, base32Encode, totpAt, verifyTotp } from "@/lib/totp";
import { makeAgToken, readAgToken } from "@/lib/agegate-token";
import { hashPassword, verifyPassword } from "@/lib/crypto";

const SHORT = ["bit.ly", "t.co"];

describe("アフィリエイトURLの検証", () => {
  it("httpsの通常URLは通る", () => {
    const r = checkAffiliateUrl("https://www.example.com/a?b=1", SHORT);
    expect(r).toEqual({ ok: true, url: "https://www.example.com/a?b=1", domain: "example.com" });
  });
  it.each([
    ["http://example.com", "https://"],
    ["https://192.168.0.1/x", "IPアドレス"],
    ["https://3232235521/x", "IPアドレス"],
    ["https://[::1]/x", "IPアドレス"],
    ["https://user:pw@example.com", "ユーザー情報"],
    ["https://example.com:8443/", "ポート"],
    ["https://bit.ly/abc", "短縮URL"],
    ["javascript:alert(1)", "https://"],
    ["https://example.com/%252e", "二重"],
    ["https://exa mple.com", "使えない文字"],
    ["https://xn--80ak6aa92e.com", "国際化"],
  ])("%s は拒否", (u, why) => {
    const r = checkAffiliateUrl(u, SHORT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(why);
  });
  it("2段TLDを登録ドメインとして扱う", () => {
    expect(registrableDomain("shop.example.co.jp")).toBe("example.co.jp");
    expect(registrableDomain("a.b.example.com")).toBe("example.com");
  });
  it("コメント中のURLを検出する", () => {
    expect(containsUrl("見てね https://x.com")).toBe(true);
    expect(containsUrl("example.com で検索")).toBe(true);
    expect(containsUrl("素敵な夜ですね")).toBe(false);
  });
});

describe("テーマエンジン", () => {
  it("全プリセットでボタンの文字が4.5:1以上", () => {
    for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      for (const mode of ["dark", "light"] as const) {
        const t = tokensFor(id, mode);
        expect(contrast(t.on, t.fill), `${id}/${mode}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.muted, t.surface), `${id}/${mode} muted`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("ライトテーマでも動画上のアクセントは暗い背景で見える", () => {
    for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      expect(contrast(videoTokens(id).accent, "#07070B")).toBeGreaterThanOrEqual(3);
    }
  });
  it("読みにくいカスタム色は警告し、自動補正で解消する", () => {
    const bad = { accent2: "#222222", accent: "#151515", bg: "#101010", surface: "#141414", text: "#333333" };
    expect(contrastWarnings(bad).length).toBeGreaterThan(0);
    expect(contrastWarnings(autoFix(bad))).toEqual([]);
  });
  it("壊れたCookie値は既定に戻す", () => {
    expect(parsePref("{broken").id).toBe("midnight");
    expect(parsePref(JSON.stringify({ id: "rose", mode: "light", custom: { bg: "red" } })).custom.bg).toBe("#0C0B14");
  });
});

describe("TOTP", () => {
  it("RFC 6238 のテストベクタ（SHA-1）", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpAt(secret, 59_000)).toBe("287082");
    expect(totpAt(secret, 1111111109_000)).toBe("081804");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("±30秒まで許容し、それ以外は拒否", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now - 90_000), now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
  });
});

describe("年齢確認Cookie", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  it("署名が正しく期限内なら読める", () => {
    const t = makeAgToken(id, new Date(Date.now() + 60_000));
    expect(readAgToken(t)?.sessionId).toBe(id);
  });
  it("改ざん・期限切れは拒否", () => {
    const t = makeAgToken(id, new Date(Date.now() + 60_000));
    expect(readAgToken(t.slice(0, -2) + "xx")).toBeNull();
    expect(readAgToken(t.replace(/\.(\d+)\./, (_, n) => `.${Number(n) + 999}.`))).toBeNull();
    expect(readAgToken(makeAgToken(id, new Date(Date.now() - 1000)))).toBeNull();
    expect(readAgToken(undefined)).toBeNull();
  });
});

describe("パスワード", () => {
  it("ハッシュして検証できる", async () => {
    const h = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("データベース接続の設定", () => {
  it("Supabase は専用スキーマ glow と SSL 必須になる", async () => {
    const { connectionOptions } = await import("@/db");
    expect(connectionOptions("postgresql://postgres.abc:pw@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres")).toEqual({ schemaName: "glow", ssl: "require" });
    expect(connectionOptions("postgresql://postgres:pw@db.abcdef.supabase.co:5432/postgres")).toEqual({ schemaName: "glow", ssl: "require" });
  });
  it("Render などはそのまま（sslmode を尊重）", async () => {
    const { connectionOptions } = await import("@/db");
    expect(connectionOptions("postgres://u:p@dpg-xxx-a/glow")).toEqual({ schemaName: null, ssl: undefined });
    expect(connectionOptions("postgres://u:p@host/db?sslmode=require").ssl).toBe("require");
  });
});
