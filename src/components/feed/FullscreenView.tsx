"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoCard } from "@/lib/content";
import { Icon } from "../Icon";
import { VideoBackdrop } from "../VideoBackdrop";
import { FeedVideo } from "./FeedVideo";

/**
 * 全画面表示：動画だけを画面いっぱいに（切らずに全体を表示）。ボタンは「戻る」だけ。
 * - 対応している端末ではブラウザの全画面にし、横長の動画は横向きに固定する
 * - 端末の「戻る」操作でも閉じられるよう、履歴を1つ積む
 */
export function FullscreenView({ card, startAt, muted, rate, onClose }: { card: VideoCard; startAt: number; muted: boolean; rate: number; onClose: (t: number) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const closed = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const landscape = !!card.width && !!card.height && card.width > card.height;

  const finish = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    const t = root.current?.querySelector("video")?.currentTime ?? 0;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    try { screen.orientation?.unlock?.(); } catch {}
    onCloseRef.current(t);
  }, []);

  useEffect(() => {
    // 開発時の二重実行でも履歴を2つ積まないように
    if (!history.state?.glowFs) history.pushState({ ...history.state, glowFs: 1 }, "");
    const pop = () => finish();
    window.addEventListener("popstate", pop);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") history.back(); };
    window.addEventListener("keydown", key);
    const el = root.current;
    if (el?.requestFullscreen) {
      el.requestFullscreen({ navigationUI: "hide" }).then(() => {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        if (landscape) void o.lock?.("landscape").catch(() => {});
      }).catch(() => {});
    }
    return () => { window.removeEventListener("popstate", pop); window.removeEventListener("keydown", key); };
  }, [finish, landscape]);

  return (
    <div className="fs vt" ref={root} role="dialog" aria-modal="true" aria-label="全画面表示"
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) setPaused((p) => !p); }}>
      {card.src
        ? <FeedVideo src={card.src} poster={card.poster} width={card.width} height={card.height} active paused={paused} muted={muted} rate={rate} preload="active" contain startAt={startAt} />
        : <VideoBackdrop hue={card.hue} live={!paused} />}
      {paused && <div className="fs-play" aria-hidden="true"><Icon name="play" size={34} filled /></div>}
      <button className="fs-back" onClick={() => history.back()} aria-label="全画面表示を終了"><Icon name="back" size={26} stroke={2.2} /></button>
    </div>
  );
}
