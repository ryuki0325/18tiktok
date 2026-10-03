"use client";
import { useEffect, useRef } from "react";
import { loadHls } from "./feed/FeedVideo";

/** 審査用のプレイヤー（操作バー付き）。HLS は hls.js で再生 */
export function ReviewPlayer({ src, poster }: { src: string; poster: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let destroy = () => {};
    if (/\.m3u8(\?|$)/.test(src) && !v.canPlayType("application/vnd.apple.mpegurl")) {
      void loadHls().then((Hls) => { const h = new Hls(); h.loadSource(src); h.attachMedia(v); destroy = () => h.destroy(); });
    } else v.src = src;
    return () => destroy();
  }, [src]);
  return <video ref={ref} poster={poster ?? undefined} controls playsInline muted preload="metadata" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />;
}
