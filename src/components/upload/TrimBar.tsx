"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

/**
 * 動画の切り取り（トリミング）。TikTok と同じく、両端をつまんで範囲を決める。
 * 決めた範囲はサーバーに送り、変換のときに実際に切る（切った部分は配信されない）。
 */
const MIN_MS = 1000;

export function TrimBar({ file, uploadId, durationMs, value, onClose }: {
  file: File; uploadId: string; durationMs: number;
  value: { startMs: number; endMs: number } | null;
  onClose: (v: { startMs: number; endMs: number } | null, saved: boolean) => void;
}) {
  const dur = Math.max(MIN_MS, durationMs);
  const [start, setStart] = useState(value?.startMs ?? 0);
  const [end, setEnd] = useState(value?.endMs ?? dur);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<"s" | "e" | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // 選んだ範囲だけをくり返し再生して、仕上がりを確かめられるようにする
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    const tick = () => {
      if (v.currentTime * 1000 < start - 120 || v.currentTime * 1000 > end) v.currentTime = start / 1000;
    };
    v.addEventListener("timeupdate", tick);
    return () => v.removeEventListener("timeupdate", tick);
  }, [start, end]);

  const at = (clientX: number) => {
    const b = bar.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - b.left) / b.width)) * dur);
  };

  const move = (clientX: number) => {
    const t = at(clientX);
    if (drag.current === "s") {
      const ns = Math.min(t, end - MIN_MS);
      setStart(Math.max(0, ns));
      if (vid.current) vid.current.currentTime = Math.max(0, ns) / 1000;
    } else if (drag.current === "e") {
      const ne = Math.max(t, start + MIN_MS);
      setEnd(Math.min(dur, ne));
      if (vid.current) vid.current.currentTime = Math.max(0, Math.min(dur, ne) - 400) / 1000;
    }
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => { if (drag.current) { e.preventDefault(); move(e.clientX); } };
    const onUp = () => { drag.current = null; };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  });

  // キーボードでも動かせるようにする（つまみに矢印キー）
  const key = (which: "s" | "e") => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 1000 : 100;
    const d = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    if (!d) return;
    e.preventDefault();
    if (which === "s") setStart((v) => Math.max(0, Math.min(v + d, end - MIN_MS)));
    else setEnd((v) => Math.min(dur, Math.max(v + d, start + MIN_MS)));
  };

  const whole = start === 0 && end >= dur - 50;
  const save = async () => {
    setBusy(true);
    const body = whole ? null : { startMs: start, endMs: end };
    const r = await fetch(`/api/v1/uploads/${uploadId}/trim`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) { setNote(r?.error?.message ?? "切り取れませんでした"); return; }
    onClose(whole ? null : { startMs: start, endMs: end }, true);
  };

  const sec = (ms: number) => `${Math.floor(ms / 1000 / 60)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, "0")}`;
  const pc = (ms: number) => `${(ms / dur) * 100}%`;

  return (
    <>
      <div className="sheet-bg" onClick={() => onClose(value, false)} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="長さを切り取る">
        <span className="grab" />
        <div className="hd">
          <b style={{ fontSize: 20 }}>長さを切り取る</b>
          <button type="button" className="iconbtn" style={{ marginRight: -8 }} onClick={() => onClose(value, false)} aria-label="閉じる"><Icon name="x" size={22} /></button>
        </div>

        <div className="trim-prev">
          {url && <video ref={vid} src={url} muted playsInline autoPlay loop />}
        </div>

        <div className="trim-bar" ref={bar}>
          <span className="trim-sel" style={{ left: pc(start), right: `${100 - (end / dur) * 100}%` }} />
          <button type="button" className="trim-h" style={{ left: pc(start) }} aria-label="始まりの位置"
            aria-valuemin={0} aria-valuemax={dur} aria-valuenow={start} role="slider" tabIndex={0}
            onKeyDown={key("s")} onPointerDown={(e) => { drag.current = "s"; e.currentTarget.focus(); }} />
          <button type="button" className="trim-h" style={{ left: pc(end) }} aria-label="終わりの位置"
            aria-valuemin={0} aria-valuemax={dur} aria-valuenow={end} role="slider" tabIndex={0}
            onKeyDown={key("e")} onPointerDown={(e) => { drag.current = "e"; e.currentTarget.focus(); }} />
        </div>
        <div className="trim-nums">
          <span className="cap num">{sec(start)}</span>
          <span className="cap num"><b>{sec(end - start)}</b> になります</span>
          <span className="cap num">{sec(end)}</span>
        </div>

        {note && <span className="cap" style={{ color: "var(--bad)" }}>{note}</span>}
        <span className="cap">切り取った部分は変換のときに取り除かれ、あとから見ることはできません。</span>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn btn-secondary pill" style={{ flex: 1 }} disabled={busy || whole}
            onClick={() => { setStart(0); setEnd(dur); }}>全体に戻す</button>
          <button type="button" className="btn btn-primary pill" style={{ flex: 2 }} disabled={busy} onClick={save}>
            {busy ? "切り取り中…" : "この長さにする"}
          </button>
        </div>
      </div>
    </>
  );
}
