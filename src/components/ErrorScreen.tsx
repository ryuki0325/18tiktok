"use client";
import { useEffect, useState } from "react";

/** 読み込みに失敗したファイル（デプロイ直後・通信の瞬断）なら、1回だけ自動で読み込み直す */
const isChunkError = (e: unknown) => /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(String((e as Error)?.message ?? e) + String((e as Error)?.name ?? ""));

export async function hardReload() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys?.()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {}
  location.replace(location.pathname + location.search);
}

export function reportClientError(e: unknown, where: string) {
  try {
    const err = e as Error & { digest?: string };
    const body = JSON.stringify({ where, message: String(err?.message ?? e).slice(0, 500), stack: String(err?.stack ?? "").slice(0, 1500), digest: err?.digest, url: location.href, ua: navigator.userAgent });
    navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" })) || void fetch("/api/client-error", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch {}
}

export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const [retrying] = useState(() => { try { return isChunkError(error) && !sessionStorage.getItem("glow.autoReloaded"); } catch { return false; } });
  useEffect(() => {
    reportClientError(error, "error-boundary");
    if (retrying) {
      try { sessionStorage.setItem("glow.autoReloaded", "1"); } catch {}
      void hardReload();
    }
  }, [error, retrying]);
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 28px", textAlign: "center", background: "#090A0F", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ fontSize: 40 }} aria-hidden="true">⚠︎</div>
      <h1 style={{ fontSize: 20, margin: 0 }}>{retrying ? "読み込み直しています…" : "うまく表示できませんでした"}</h1>
      {!retrying && <>
        <p style={{ margin: 0, color: "#A8ABB8", fontSize: 14, lineHeight: 1.7 }}>通信が不安定か、サイトの更新直後の可能性があります。もう一度お試しください。</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320, marginTop: 6 }}>
          <button onClick={() => (reset ? reset() : location.reload())} style={{ height: 48, borderRadius: 999, border: 0, background: "linear-gradient(90deg,#A13BEB,#7B4BF0)", color: "#fff", fontWeight: 700, fontSize: 16 }}>もう一度試す</button>
          <button onClick={() => void hardReload()} style={{ height: 48, borderRadius: 999, background: "transparent", color: "#fff", border: "1px solid #ffffff38", fontWeight: 600, fontSize: 15 }}>キャッシュを消して読み込み直す</button>
          {/* 壊れた状態から確実に抜けるため、あえて全体を読み込み直すリンクにする */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ color: "#A8ABB8", fontSize: 13, marginTop: 4 }}>ホームへ戻る</a>
        </div>
        <p style={{ margin: "18px 0 0", color: "#6b6f80", fontSize: 11, wordBreak: "break-all", maxWidth: 360 }}>
          エラー内容：{String(error?.message ?? "").slice(0, 160) || "不明"}{error?.digest ? `（${error.digest}）` : ""}
        </p>
      </>}
    </div>
  );
}

/** ページ全体で起きたエラーをサーバーのログに送る（原因調査用） */
export function ClientErrorReporter() {
  useEffect(() => {
    const onErr = (e: ErrorEvent) => reportClientError(e.error ?? e.message, "window.onerror");
    const onRej = (e: PromiseRejectionEvent) => {
      reportClientError(e.reason, "unhandledrejection");
      try { if (isChunkError(e.reason) && !sessionStorage.getItem("glow.autoReloaded")) { sessionStorage.setItem("glow.autoReloaded", "1"); void hardReload(); } } catch {}
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    // 正常に表示できたら、自動再読み込みの記録を消す（次に壊れた時にまた1回だけ自動で直せるように）
    const t = setTimeout(() => { try { sessionStorage.removeItem("glow.autoReloaded"); } catch {} }, 10_000);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); clearTimeout(t); };
  }, []);
  return null;
}
