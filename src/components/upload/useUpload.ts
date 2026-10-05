"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { readVideoInfo, uploadFile, UploadError } from "./tus";

export type UploadState =
  | { k: "idle" }
  | { k: "reading" }
  | { k: "uploading"; sent: number; total: number }
  | { k: "paused"; sent: number; total: number; message?: string }
  | { k: "processing"; id: string }
  | { k: "ready"; id: string }
  | { k: "failed"; message: string };

export type VideoInfo = { width: number; height: number; durationMs: number; poster: string | null };

/**
 * 動画の送信をまとめて受け持つ。
 * TikTok と同じく、キャプションを書いている間も裏で送り続ける。
 */
export function useUpload({ maxMb, maxSec, onReady }: { maxMb: number; maxSec: number; onReady: (id: string | null) => void }) {
  const [state, setState] = useState<UploadState>({ k: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const fileRef = useRef<File | null>(null);
  const infoRef = useRef<VideoInfo | null>(null);
  const readyRef = useRef(onReady);
  useEffect(() => { readyRef.current = onReady; }, [onReady]);

  useEffect(() => () => { ctrl.current?.abort(); }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // 変換の進み具合を見にいく
  const processingId = state.k === "processing" ? state.id : null;
  useEffect(() => {
    if (!processingId) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const r = await fetch(`/api/v1/uploads/${processingId}`).then((x) => x.json()).catch(() => null);
      if (stop) return;
      if (r?.status === "ready") setState({ k: "ready", id: processingId });
      else if (r?.status === "failed") { setState({ k: "failed", message: r.error || "動画を変換できませんでした" }); readyRef.current(null); }
      else setTimeout(tick, 3000);
    };
    void tick();
    return () => { stop = true; };
  }, [processingId]);

  const send = useCallback(async () => {
    const f = fileRef.current;
    if (!f) return;
    ctrl.current = new AbortController();
    setState({ k: "uploading", sent: 0, total: f.size });
    try {
      const { id } = await uploadFile(f, {
        signal: ctrl.current.signal,
        onProgress: (p) => setState({ k: "uploading", sent: p.sent, total: p.total }),
      });
      const i = infoRef.current;
      const body = i && i.width ? { width: i.width, height: i.height, durationMs: i.durationMs || undefined, poster: i.poster ?? undefined } : {};
      const done = await fetch(`/api/v1/uploads/${id}/complete`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!done.ok) {
        const j = await done.json().catch(() => ({}));
        throw new UploadError(j?.error?.message ?? "アップロードを完了できませんでした");
      }
      const j = await done.json();
      readyRef.current(id);
      setState(j.status === "ready" ? { k: "ready", id } : { k: "processing", id });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState((s) => (s.k === "uploading"
        ? { k: "paused", sent: s.sent, total: s.total, message: e instanceof UploadError ? e.message : "通信が切れました。「再開」で続きから送れます" }
        : { k: "failed", message: (e as Error).message }));
    }
  }, []);

  const pick = useCallback(async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) { setState({ k: "failed", message: "動画ファイルを選んでください" }); return; }
    if (f.size > maxMb * 1024 * 1024) { setState({ k: "failed", message: `ファイルが大きすぎます（${maxMb}MBまで）` }); return; }
    readyRef.current(null);
    setState({ k: "reading" });
    const i = await readVideoInfo(f);
    if (i.durationMs && i.durationMs / 1000 > maxSec + 1) {
      setState({ k: "failed", message: `動画が長すぎます（${Math.floor(maxSec / 60)}分までです）` });
      return;
    }
    fileRef.current = f; infoRef.current = i;
    setFile(f); setInfo(i); setCover(i.poster);
    setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
    void send();
  }, [maxMb, maxSec, send]);

  const pause = useCallback(() => {
    ctrl.current?.abort();
    setState((s) => (s.k === "uploading" ? { k: "paused", sent: s.sent, total: s.total } : s));
  }, []);

  const reset = useCallback(() => {
    ctrl.current?.abort();
    fileRef.current = null; infoRef.current = null;
    setFile(null); setInfo(null); setCover(null);
    setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    readyRef.current(null);
    setState({ k: "idle" });
  }, []);

  const pct = state.k === "uploading" || state.k === "paused"
    ? Math.floor((state.sent / Math.max(1, state.total)) * 100)
    : state.k === "processing" || state.k === "ready" ? 100 : 0;

  return { state, file, previewUrl, info, cover, setCover, pick, pause, resume: send, reset, pct };
}
