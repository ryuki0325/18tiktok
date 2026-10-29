"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

/**
 * 表紙（サムネイル）を決める。2通り：
 *  - 動画の中から1コマを選ぶ（下のコマ送りを横に動かす）→ サーバーでその場面を切り出す
 *  - 自分で用意した画像をアップロードして表紙にする（＝ずっとこの絵が表紙）
 */
const FRAMES = 8;

/** カバー画像を長辺1280pxまで縮めてJPEGにする（端末内で処理） */
const COVER_MAX_SIDE = 1280;
function shrinkImage(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, COVER_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) { reject(new Error("no ctx")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: c.toDataURL("image/jpeg", 0.8), w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読み込めませんでした")); };
    img.src = url;
  });
}

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
  const imgInput = useRef<HTMLInputElement>(null);

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

  // 自分で用意した画像を表紙にする
  const pickImage = async (file: File) => {
    setNote(null); setBusy(true);
    try {
      const im = await shrinkImage(file);
      const r = await fetch(`/api/v1/uploads/${uploadId}/cover`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: im }),
      }).then((x) => x.json()).catch(() => ({ ok: false }));
      setBusy(false);
      if (!r.ok) { setNote("カバー画像を設定できませんでした。別の画像でお試しください"); return; }
      onClose({ timeMs: -1, dataUrl: im.dataUrl, changed: true });
    } catch {
      setBusy(false);
      setNote("画像を読み込めませんでした");
    }
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
          {busy ? "設定中…" : "この場面を表紙にする"}
        </button>
        {/* 自分で用意した画像を表紙にする（＝ずっとこの絵が表紙） */}
        <button type="button" className="btn btn-secondary pill" disabled={busy} onClick={() => imgInput.current?.click()} style={{ marginTop: -4 }}>
          <Icon name="images" size={18} /> 画像をアップロードして表紙にする
        </button>
        <input ref={imgInput} type="file" accept="image/*" hidden aria-label="表紙にする画像を選ぶ"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pickImage(f); }} />
      </div>
    </>
  );
}
