"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { readVideoInfo, uploadFile, UploadError } from "./tus";

type State =
  | { k: "idle" }
  | { k: "uploading"; sent: number; total: number; name: string }
  | { k: "paused"; sent: number; total: number; name: string; message?: string }
  | { k: "processing"; id: string; name: string }
  | { k: "ready"; id: string; name: string }
  | { k: "failed"; message: string };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 100 * 1024 * 1024 ? 0 : 1)}MB`;

/**
 * 動画ファイルの選択とアップロード。大きなファイルも 8MB ずつ分けて送り、切れても続きから再開できる。
 * 送り終えたら uploadId を親フォームに渡す（変換が終わる前に投稿してもよい）
 */
export function VideoUploader({ onChange, maxMb, maxSec }: { onChange: (uploadId: string | null) => void; maxMb: number; maxSec: number }) {
  const [st, setSt] = useState<State>({ k: "idle" });
  const [preview, setPreview] = useState<{ url: string; landscape: boolean } | null>(null);
  const file = useRef<File | null>(null);
  const info = useRef<Awaited<ReturnType<typeof readVideoInfo>> | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => ctrl.current?.abort(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  // 変換の進み具合を確認
  const processingId = st.k === "processing" ? st.id : null;
  useEffect(() => {
    if (!processingId) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const r = await fetch(`/api/v1/uploads/${processingId}`).then((x) => x.json()).catch(() => null);
      if (stop) return;
      if (r?.status === "ready") setSt((s) => (s.k === "processing" ? { k: "ready", id: s.id, name: s.name } : s));
      else if (r?.status === "failed") { setSt({ k: "failed", message: "動画を変換できませんでした。別のファイルでお試しください" }); onChange(null); }
      else setTimeout(tick, 3000);
    };
    void tick();
    return () => { stop = true; };
  }, [processingId, onChange]);

  const send = async () => {
    const f = file.current;
    if (!f) return;
    ctrl.current = new AbortController();
    setSt({ k: "uploading", sent: 0, total: f.size, name: f.name });
    try {
      const { id } = await uploadFile(f, { signal: ctrl.current.signal, onProgress: (p) => setSt({ k: "uploading", sent: p.sent, total: p.total, name: f.name }) });
      const i = info.current;
      const body = i && i.width ? { width: i.width, height: i.height, durationMs: i.durationMs || undefined, poster: i.poster ?? undefined } : {};
      const done = await fetch(`/api/v1/uploads/${id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!done.ok) throw new UploadError("アップロードを完了できませんでした");
      const j = await done.json();
      onChange(id);
      setSt(j.status === "ready" ? { k: "ready", id, name: f.name } : { k: "processing", id, name: f.name });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setSt((s) => s.k === "uploading" ? { k: "paused", sent: s.sent, total: s.total, name: s.name, message: e instanceof UploadError ? e.message : "通信が切れました。「再開」で続きから送れます" } : { k: "failed", message: (e as Error).message });
    }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) { setSt({ k: "failed", message: "動画ファイルを選んでください" }); return; }
    if (f.size > maxMb * 1024 * 1024) { setSt({ k: "failed", message: `ファイルが大きすぎます（${maxMb}MBまで）` }); return; }
    onChange(null);
    file.current = f;
    info.current = await readVideoInfo(f);
    const sec = (info.current.durationMs || 0) / 1000;
    if (sec > maxSec + 1) { setSt({ k: "failed", message: `動画が長すぎます（${Math.floor(maxSec / 60)}分までです）` }); file.current = null; return; }
    setPreview({ url: URL.createObjectURL(f), landscape: !!info.current.width && info.current.width > info.current.height });
    void send();
  };

  const pause = () => { ctrl.current?.abort(); setSt((s) => (s.k === "uploading" ? { k: "paused", sent: s.sent, total: s.total, name: s.name } : s)); };
  const reset = () => { ctrl.current?.abort(); file.current = null; setPreview(null); onChange(null); setSt({ k: "idle" }); if (input.current) input.current.value = ""; };

  const pct = st.k === "uploading" || st.k === "paused" ? Math.floor((st.sent / Math.max(1, st.total)) * 100) : st.k === "processing" || st.k === "ready" ? 100 : 0;
  return (
    <div className="uploader card" data-state={st.k} data-ready={mounted || undefined}>
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => void pick(e.target.files?.[0])} aria-label="動画ファイル" />
      {preview ? (
        <div className={`up-preview${preview.landscape ? " land" : ""}`}><video src={preview.url} muted playsInline loop autoPlay /></div>
      ) : (
        <button type="button" className="up-pick" onClick={() => input.current?.click()}>
          <span className="up-ic"><Icon name="upload" size={28} /></span>
          <b>動画を選ぶ</b>
          <span className="cap">縦長がおすすめ（横長もそのまま表示されます）<br />{Math.floor(maxSec / 60)}分・{maxMb >= 1024 ? `${maxMb / 1024}GB` : `${maxMb}MB`}まで</span>
        </button>
      )}
      {st.k !== "idle" && (
        <div className="up-status" role="status" aria-live="polite">
          {(st.k === "uploading" || st.k === "paused") && (
            <>
              <div className="up-bar"><i style={{ transform: `scaleX(${pct / 100})` }} /></div>
              <div className="up-row"><span className="cap num">{st.k === "paused" ? "一時停止中" : "アップロード中"}　{pct}%（{mb(st.sent)} / {mb(st.total)}）</span>
                {st.k === "uploading" ? <button type="button" className="btn btn-sm btn-secondary" onClick={pause}>一時停止</button> : <button type="button" className="btn btn-sm btn-primary" onClick={() => void send()}>再開</button>}
              </div>
              {st.k === "paused" && st.message && <span className="cap" style={{ color: "var(--warn)" }}>{st.message}</span>}
            </>
          )}
          {st.k === "processing" && <div className="up-row"><span className="cap"><span className="spinner spin dark" /> アップロード完了・画質ごとに変換中です（このまま投稿できます）</span></div>}
          {st.k === "ready" && <div className="up-row"><span className="cap" style={{ color: "var(--ok)" }}><Icon name="check" size={14} /> 動画の準備ができました</span></div>}
          {st.k === "failed" && <span className="cap" style={{ color: "var(--bad)" }}>{st.message}</span>}
          <button type="button" className="cap up-change" onClick={reset}>別の動画を選ぶ</button>
        </div>
      )}
    </div>
  );
}
