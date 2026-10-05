"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

/**
 * 表紙（サムネイル）を動画の中から選ぶ。TikTok と同じく、下のコマ送りを横に動かして決める。
 * 選んだ位置はサーバーに送り、動画からその1コマを切り出し直してもらう。
 */
const FRAMES = 8;

export function CoverPicker({ file, uploadId, durationMs, onClose }: {
  file: File; uploadId: string; durationMs: number; onClose: (cover: { timeMs: number; dataUrl: string; changed: boolean } | null) => void;
}) {
  // url が空のときは、コマの絵が作れなかった端末（時間だけで選ぶ）
  const [frames, setFrames] = useState<{ t: number; url: string }[]>([]);
  const [noPreview, setNoPreview] = useState(false);
  const [at, setAt] = useState(0);
  const [big, setBig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const src = useRef<string>("");

  // コマ送りの帯を作る（端末の中で作るので、通信は発生しない）
  useEffect(() => {
    let dead = false;
    const url = URL.createObjectURL(file);
    src.current = url;
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    const out: { t: number; url: string }[] = [];

    const grab = (t: number) => new Promise<void>((done) => {
      const on = () => {
        v.removeEventListener("seeked", on);
        try {
          const c = document.createElement("canvas");
          const h = 96, w = Math.max(1, Math.round((v.videoWidth / Math.max(1, v.videoHeight)) * h));
          c.width = w; c.height = h;
          c.getContext("2d")!.drawImage(v, 0, 0, w, h);
          out.push({ t, url: c.toDataURL("image/jpeg", 0.6) });
        } catch {}
        done();
      };
      v.addEventListener("seeked", on);
      v.currentTime = t;
    });

    // 絵が作れない端末でも、時間だけで選べるようにしておく
    const byTime = (dur: number) => Array.from({ length: FRAMES }, (_, i) => ({ t: Math.min(dur - 0.05, (dur * i) / FRAMES), url: "" }));
    const fallback = () => {
      if (dead) return;
      setNoPreview(true);
      setFrames(byTime(durationMs / 1000 || 10));
    };
    const timer = setTimeout(() => { if (!dead && !out.length) fallback(); }, 8000);

    v.onloadedmetadata = async () => {
      const dur = durationMs / 1000 || v.duration || 1;
      for (let i = 0; i < FRAMES && !dead; i++) await grab(Math.min(dur - 0.05, (dur * i) / FRAMES));
      clearTimeout(timer);
      if (dead) return;
      if (out.length) { setFrames(out); void draw(out[0]?.t ?? 0, v); }
      else fallback();
    };
    v.onerror = () => { clearTimeout(timer); fallback(); };

    const draw = async (t: number, vid: HTMLVideoElement) => {
      await new Promise<void>((done) => {
        const on = () => { vid.removeEventListener("seeked", on); done(); };
        vid.addEventListener("seeked", on);
        vid.currentTime = t;
      });
      const c = document.createElement("canvas");
      const w = Math.min(720, vid.videoWidth || 720);
      const h = Math.round((vid.videoHeight / Math.max(1, vid.videoWidth)) * w);
      c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(vid, 0, 0, w, h);
      if (!dead) setBig(c.toDataURL("image/jpeg", 0.75));
    };
    (v as HTMLVideoElement & { __draw?: typeof draw }).__draw = draw;
    videoRef.current = v;

    return () => { dead = true; clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [file, durationMs]);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const pick = async (i: number) => {
    setAt(i);
    if (noPreview) return;
    const v = videoRef.current as (HTMLVideoElement & { __draw?: (t: number, v: HTMLVideoElement) => Promise<void> }) | null;
    if (v?.__draw) await v.__draw(frames[i].t, v);
  };

  const save = async () => {
    setBusy(true);
    const timeMs = Math.round((frames[at]?.t ?? 0) * 1000);
    const r = await fetch(`/api/v1/uploads/${uploadId}/cover`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ timeMs }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) { setNote("表紙を変えられませんでした。動画の変換が終わってからもう一度お試しください"); return; }
    onClose({ timeMs, dataUrl: big ?? "", changed: true });
  };

  return (
    <>
      <div className="sheet-bg" onClick={() => onClose(null)} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="表紙を選ぶ">
        <span className="grab" />
        <div className="hd">
          <b style={{ fontSize: 20 }}>表紙を選ぶ</b>
          <button type="button" className="iconbtn" style={{ marginRight: -8 }} onClick={() => onClose(null)} aria-label="閉じる"><Icon name="x" size={22} /></button>
        </div>
        {noPreview ? (
          <p className="cap" style={{ margin: 0 }}>
            この端末では動画のコマを表示できませんでした。下から位置を選ぶと、その場面を表紙にします。
          </p>
        ) : (
          <div className="cover-big">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {big ? <img src={big} alt="" /> : <span className="spinner spin dark" />}
          </div>
        )}
        <div className="cover-strip" role="radiogroup" aria-label="表紙の位置">
          {frames.length === 0 && <span className="cap">コマを読み込んでいます…</span>}
          {frames.map((f, i) => (
            <button type="button" key={i} role="radio" aria-checked={at === i} aria-label={`${Math.round(f.t)}秒`} onClick={() => void pick(i)}
              className={f.url ? undefined : "t-only"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.url ? <img src={f.url} alt="" /> : <span className="num">{Math.round(f.t)}秒</span>}
            </button>
          ))}
        </div>
        {note && <span className="cap" style={{ color: "var(--bad)" }}>{note}</span>}
        <button type="button" className="btn btn-primary pill" disabled={busy || !frames.length} onClick={save}>
          {busy ? "設定中…" : "この表紙にする"}
        </button>
      </div>
    </>
  );
}
