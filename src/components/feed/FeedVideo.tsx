"use client";
import { useEffect, useRef, useState } from "react";
import type HlsType from "hls.js/light";

/**
 * フィード用の動画プレイヤー。
 * - HLS（.m3u8）は小さなセグメントに分かれた複数画質の動画。回線に合わせてプレイヤーが画質を選ぶ（ABR）
 *   iPhone/iPad の Safari は標準で対応、それ以外は hls.js（必要になった時だけ読み込む）
 * - 表示中の1本は長めに、次の1本は最初の数秒だけ先に読み込む → スワイプした瞬間に再生が始まる
 * - 横長の動画は切らずに全体を表示（上下は黒帯）。縦長は画面いっぱい
 */
type Props = {
  src: string; poster: string | null; width: number | null; height: number | null;
  active: boolean; paused: boolean; muted: boolean; rate: number;
  /** 先読みの強さ：active=再生中 / next=次（数秒だけ）/ idle=前など（読み込まない） */
  preload: "active" | "next" | "idle";
  /** 常に全体表示にする（全画面表示用） */
  contain?: boolean;
  startAt?: number;
  onTime?: (t: number) => void;
};

let hlsModule: Promise<typeof HlsType> | null = null;
/** hls.js は必要な時に1回だけ読み込む（最初の表示を軽く） */
export const loadHls = () => (hlsModule ??= import("hls.js/light").then((m) => m.default));

const isHls = (src: string) => /\.m3u8(\?|$)/i.test(src);
const preferNativeHls = () => {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || (/Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox|Android/.test(ua));
};

/**
 * 読み込む量（秒）。通信量＝そのままCDNの料金なので、先読みしすぎないようにする。
 * スワイプで次へ行く人が多いほど、読み込んだのに見ない動画が増える。
 */
const BUFFER = { active: 12, next: 2, idle: 0 } as const;
/** 通信量の節約がオンの端末、または回線が遅いときはさらに控えめに */
const saveData = () => {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c?.saveData || c?.effectiveType === "2g" || c?.effectiveType === "slow-2g";
};
/** 1本あたりに貯める最大の量（バイト）。既定の60MBは短い動画には多すぎる */
const MAX_BUFFER_BYTES = 12 * 1024 * 1024;
/** スマホの画面で十分な高さ。これより大きい画質は使わない（通信量と電池の節約） */
const MAX_HEIGHT = 720;

export function FeedVideo({ src, poster, width, height, active, paused, muted, rate, preload, contain, startAt, onTime }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const hls = useRef<HlsType | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const preloadRef = useRef(preload);
  useEffect(() => { preloadRef.current = preload; }, [preload]);

  // 読み込み（src が変わった時だけ作り直す）
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let cancelled = false;
    if (isHls(src) && !preferNativeHls()) {
      void loadHls().then((Hls) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { v.src = src; return; }
        const p = preloadRef.current;
        const slow = saveData();
        const h = new Hls({
          // 画面の大きさ以上の画質は取らない（通信量と負荷を抑える）
          capLevelToPlayerSize: true, startLevel: -1, autoStartLoad: p !== "idle",
          maxBufferLength: slow ? 6 : BUFFER[p] || 4, maxMaxBufferLength: slow ? 12 : 24,
          maxBufferSize: MAX_BUFFER_BYTES, backBufferLength: 6,
          // 最初の1本目は回線速度の推定値から。以降は実測で切り替え
          abrEwmaDefaultEstimate: slow ? 600_000 : 2_000_000, startFragPrefetch: true,
        });
        h.loadSource(src);
        h.attachMedia(v);
        // スマホの画面には 720p で十分。それ以上の画質があっても使わない
        h.on(Hls.Events.MANIFEST_PARSED, () => {
          const max = h.levels.reduce((best, lv, i) => (lv.height <= MAX_HEIGHT && lv.height >= (h.levels[best]?.height ?? 0) ? i : best), 0);
          h.autoLevelCapping = max;
        });
        hls.current = h;
      });
    } else {
      v.src = src;
    }
    return () => {
      cancelled = true;
      hls.current?.destroy();
      hls.current = null;
      v.removeAttribute("src");
      v.load();
    };
  }, [src]);

  // 先読みの量を切り替え（次の動画は少しだけ、再生中は多めに）
  useEffect(() => {
    const h = hls.current, v = ref.current;
    if (v) v.preload = preload === "idle" ? "metadata" : "auto";
    if (!h) return;
    if (preload === "idle") { h.stopLoad(); return; }
    h.config.maxBufferLength = saveData() ? 6 : BUFFER[preload];
    h.startLoad(-1);
  }, [preload]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active && !paused) {
      if (startAt !== undefined && v.currentTime === 0 && startAt > 0) v.currentTime = startAt;
      void v.play().catch(() => {
        // 音ありの自動再生が止められた場合は、音を消して再生し直す
        if (!v.muted) { v.muted = true; void v.play().catch(() => {}); }
      });
    } else {
      v.pause();
      if (!active && v.currentTime > 0) v.currentTime = 0;
    }
  }, [active, paused, startAt]);

  // 画面を閉じている・別のアプリを見ている間は読み込みを止める（気づかないうちに通信しない）
  useEffect(() => {
    const vis = () => {
      const h = hls.current;
      if (!h) return;
      if (document.hidden) h.stopLoad();
      else if (preloadRef.current !== "idle") h.startLoad(-1);
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  useEffect(() => { if (ref.current) ref.current.muted = muted; }, [muted]);
  useEffect(() => { if (ref.current) ref.current.playbackRate = rate; }, [rate]);

  const w = width ?? natural?.w, h = height ?? natural?.h;
  const landscape = !!w && !!h && w > h;
  return (
    <>
      <video
        ref={ref} className={`fv${contain || landscape ? " contain" : ""}`} poster={poster ?? undefined}
        playsInline loop muted={muted} preload={preload === "idle" ? "metadata" : "auto"}
        disablePictureInPicture controlsList="nodownload noplaybackrate noremoteplayback" x-webkit-airplay="deny"
        onLoadedMetadata={(e) => { const v = e.currentTarget; v.playbackRate = rate; if (v.videoWidth) setNatural({ w: v.videoWidth, h: v.videoHeight }); }}
        onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) onTime?.(v.currentTime / v.duration); }}
      />
      {active && waiting && !paused && <span className="vwait" aria-hidden="true"><span className="spinner spin" /></span>}
    </>
  );
}
