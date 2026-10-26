"use client";
import { useEffect, useRef, useState } from "react";
import { useUpload } from "@/components/upload/useUpload";

/** 端末の画像を縮小してアップロードし、配信URLを返す（写真投稿と同じ /api/v1/images を使う） */
async function uploadImage(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return null;
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  const dataUrl = c.toDataURL("image/jpeg", 0.8);
  const r = await fetch("/api/v1/images", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataUrl, w, h }) });
  if (!r.ok) return null;
  return (await r.json()).url as string;
}

/**
 * 広告の見せ方（動画・画像）。端末から添付（アップロード）するか、URL/埋め込みコードを貼る。
 * 優先度：添付動画 ＞ 埋め込み ＞ 画像。
 */
export function PromoMedia({ maxMb, maxSec, initial }: {
  maxMb: number; maxSec: number;
  initial?: { imageUrl: string | null; videoUrl: string | null; embedUrl: string | null };
}) {
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? "");
  const [imgBusy, setImgBusy] = useState(false);
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);

  const up = useUpload({ maxMb, maxSec, onReady: () => {} });
  // アップロードが ready になったら、再生URL（HLS/MP4）を取り出して videoUrl にする
  useEffect(() => {
    if (up.state.k !== "ready") return;
    const id = up.state.id;
    fetch(`/api/v1/uploads/${id}`).then((r) => r.json()).then((j) => { if (j?.playbackUrl) setVideoUrl(j.playbackUrl); }).catch(() => {});
  }, [up.state]);

  const pickImage = async (f: File | undefined) => {
    if (!f) return;
    setImgBusy(true);
    const url = await uploadImage(f).catch(() => null);
    setImgBusy(false);
    if (url) setImageUrl(url); else alert("画像をアップロードできませんでした");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <input type="hidden" name="videoUrl" value={videoUrl} />
      <input type="hidden" name="imageUrl" value={imageUrl} />

      {/* 動画 */}
      <span className="label">動画（任意・背景に自動再生で流れる）</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => vidInput.current?.click()}>
          {videoUrl ? "動画を変更" : "動画を添付"}
        </button>
        {up.state.k === "reading" && <span className="cap num"><span className="spinner spin" /> 読み込み中…</span>}
        {(up.state.k === "uploading" || up.state.k === "paused") && <span className="cap num">送信中… {up.pct}%</span>}
        {up.state.k === "processing" && <span className="cap num"><span className="spinner spin" /> 変換中…（完了すると設定されます）</span>}
        {videoUrl && up.state.k !== "uploading" && <span className="cap num" style={{ color: "var(--ok)" }}>✓ 動画を設定しました</span>}
        {videoUrl && <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setVideoUrl(""); up.reset(); }}>外す</button>}
        {up.state.k === "failed" && <span className="cap" style={{ color: "var(--bad)" }}>{up.state.message}</span>}
      </div>
      <input ref={vidInput} type="file" accept="video/*" hidden aria-label="動画ファイルを選ぶ"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void up.pick(f); }} />
      <span className="cap">または、他サイトの映像を貼る（埋め込みURL／iframeコード）：</span>
      <textarea className="input num" name="embed" rows={2} placeholder="https://… または <iframe…> コード（配信中の映像・公式サンプル）" style={{ resize: "vertical", minHeight: 44 }} defaultValue={initial?.embedUrl ?? ""} />

      {/* 画像 */}
      <span className="label" style={{ marginTop: 4 }}>画像（任意・動画がない時の背景）</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => imgInput.current?.click()}>
          {imageUrl ? "画像を変更" : "画像を添付"}
        </button>
        {imgBusy && <span className="cap num"><span className="spinner spin" /> アップロード中…</span>}
        {imageUrl && !imgBusy && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" style={{ height: 40, borderRadius: 6 }} />
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setImageUrl("")}>外す</button>
          </>
        )}
      </div>
      <input ref={imgInput} type="file" accept="image/*" hidden aria-label="画像ファイルを選ぶ"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pickImage(f); }} />
      <input className="input num" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="または 画像URL https://…" aria-label="画像URL" />

      <span className="cap">背景は「動画 ＞ 画像 ＞ 色」の順で使われます。{maxMb >= 1024 ? `${Math.round(maxMb / 1024 * 10) / 10}GB` : `${maxMb}MB`}・最長{Math.floor(maxSec / 60)}分まで。</span>
    </div>
  );
}
