"use client";
/**
 * 最小限の tus 1.0 クライアント（チャンク・再開可能なアップロード）。
 * 1) POST /api/v1/uploads で初期化 → 送信先（tus）を受け取る
 * 2) 送信先に作成（POST）→ ファイルを chunkSize ごとに PATCH
 * 3) 失敗したら HEAD で受け取り済みの位置を聞き、続きから再送（回線が切れても最初からやり直さない）
 * 4) 同じファイルを選び直した場合も、端末に覚えた送信先から続きを送る
 */
export type TusTarget = { endpoint: string; headers: Record<string, string>; metadata: Record<string, string>; chunkSize: number };
type Saved = { id: string; provider: string; location: string; tus: TusTarget; at: number };

const STORE = "glow.uploads";
const fingerprint = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
const readStore = (): Record<string, Saved> => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };
const writeStore = (v: Record<string, Saved>) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} };
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class UploadError extends Error {}

/** 送りかけのまま残っている動画（ページを閉じても端末に覚えている） */
export type Unfinished = { filename: string; size: number; sent: number; at: number };

/**
 * 前に送りかけた動画が残っていれば返す。
 * ファイルの中身は端末の外に出せないので、同じファイルをもう一度選んでもらって続きから送る。
 */
export async function findUnfinished(): Promise<Unfinished | null> {
  const store = readStore();
  const rows = Object.entries(store).sort((a, b) => b[1].at - a[1].at);
  for (const [fp, saved] of rows) {
    if (Date.now() - saved.at > 20 * 3600_000) { delete store[fp]; continue; }
    const head = await fetch(saved.location, { method: "HEAD", headers: { "Tus-Resumable": "1.0.0", ...saved.tus.headers } }).catch(() => null);
    if (!head?.ok) { delete store[fp]; continue; }
    const sent = Number(head.headers.get("Upload-Offset") ?? 0);
    const [filename, size] = [fp.slice(0, fp.indexOf("|")), Number(fp.split("|")[1] || 0)];
    writeStore(store);
    if (sent >= size) continue; // 送り終わっている
    return { filename, size, sent, at: saved.at };
  }
  writeStore(store);
  return null;
}

/** 覚えている続きを捨てる（「やめる」を押したとき） */
export function forgetUnfinished() {
  writeStore({});
}

export type Progress = { sent: number; total: number };

export async function uploadFile(file: File, opts: { onProgress: (p: Progress) => void; signal: AbortSignal }): Promise<{ id: string }> {
  const fp = fingerprint(file);
  const store = readStore();
  let saved: Saved | undefined = store[fp];
  // 1日以上前の続きは使わない（サーバー側で片付け済み）
  if (saved && Date.now() - saved.at > 20 * 3600_000) saved = undefined;

  let offset = 0;
  if (saved) {
    const head = await fetch(saved.location, { method: "HEAD", headers: { "Tus-Resumable": "1.0.0", ...saved.tus.headers }, signal: opts.signal }).catch(() => null);
    if (head?.ok) offset = Number(head.headers.get("Upload-Offset") ?? 0);
    else saved = undefined;
  }
  if (!saved) {
    const init = await fetch("/api/v1/uploads", {
      method: "POST", headers: { "content-type": "application/json" }, signal: opts.signal,
      body: JSON.stringify({ filename: file.name, mime: file.type || "video/mp4", size: file.size }),
    });
    const j = await init.json().catch(() => ({}));
    if (!init.ok) throw new UploadError(j?.error?.message ?? "アップロードを開始できませんでした");
    const tus = j.tus as TusTarget;
    const meta = Object.entries({ ...tus.metadata, filename: file.name }).map(([k, v]) => `${k} ${b64(v)}`).join(",");
    const create = await fetch(tus.endpoint, {
      method: "POST", signal: opts.signal,
      headers: { "Tus-Resumable": "1.0.0", "Upload-Length": String(file.size), "Upload-Metadata": meta, ...tus.headers },
    });
    const loc = create.headers.get("Location");
    if (!create.ok || !loc) throw new UploadError("アップロード先を準備できませんでした");
    saved = { id: j.id, provider: j.provider, location: new URL(loc, tus.endpoint.startsWith("http") ? tus.endpoint : location.origin).toString(), tus, at: Date.now() };
    store[fp] = saved;
    writeStore(store);
  }

  const s = saved;
  opts.onProgress({ sent: offset, total: file.size });
  let retries = 0;
  while (offset < file.size) {
    if (opts.signal.aborted) throw new DOMException("中断しました", "AbortError");
    const chunk = file.slice(offset, Math.min(offset + s.tus.chunkSize, file.size));
    try {
      const res = await fetch(s.location, {
        method: "PATCH", signal: opts.signal, body: chunk,
        headers: { "Tus-Resumable": "1.0.0", "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream", ...s.tus.headers },
      });
      if (res.status === 409 || !res.ok) {
        // 位置がずれた・一時的な失敗：サーバーに受け取り済みの位置を聞き直す
        const head = await fetch(s.location, { method: "HEAD", headers: { "Tus-Resumable": "1.0.0", ...s.tus.headers }, signal: opts.signal });
        if (!head.ok) throw new UploadError("アップロードが期限切れになりました。もう一度選んでください");
        offset = Number(head.headers.get("Upload-Offset") ?? offset);
        if (++retries > 6) throw new UploadError("通信が不安定なため中断しました。「再開」で続きから送れます");
        await sleep(500 * 2 ** retries);
        continue;
      }
      offset = Number(res.headers.get("Upload-Offset") ?? offset + chunk.size);
      retries = 0;
      opts.onProgress({ sent: offset, total: file.size });
    } catch (e) {
      if ((e as Error).name === "AbortError" || e instanceof UploadError) throw e;
      if (++retries > 6) throw new UploadError("通信が不安定なため中断しました。「再開」で続きから送れます");
      await sleep(500 * 2 ** retries);
    }
  }
  const st = readStore();
  delete st[fp];
  writeStore(st);
  return { id: s.id };
}

/** 動画の縦横・長さ・サムネイル（最初の方の1コマ）をブラウザで読み取る */
export function readVideoInfo(file: File): Promise<{ width: number; height: number; durationMs: number; poster: string | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    const done = (poster: string | null) => { URL.revokeObjectURL(url); resolve({ width: v.videoWidth, height: v.videoHeight, durationMs: Math.round((v.duration || 0) * 1000), poster }); };
    const timer = setTimeout(() => done(null), 8000);
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 0) / 2); };
    v.onseeked = () => {
      clearTimeout(timer);
      try {
        const scale = Math.min(1, 540 / Math.max(1, Math.min(v.videoWidth, v.videoHeight)));
        const c = document.createElement("canvas");
        c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        const d = c.toDataURL("image/jpeg", 0.72);
        done(d.length < 380_000 ? d : null);
      } catch { done(null); }
    };
    v.onerror = () => { clearTimeout(timer); done(null); };
  });
}
