"use client";
import { useRef, useState } from "react";

/**
 * 写真投稿の表示。横スワイプで複数枚を見る（縦スワイプは外側のフィードが拾う）。
 * 見せ方は動画と同じで、縦長は画面いっぱい、横長は切らずに全体。
 * スマホを横に倒したときだけ横長を画面いっぱいにする（.fv-land と同じルール）。
 */
export function PhotoCarousel({ images, active }: {
  images: { url: string; w: number; h: number }[];
  active: boolean;
}) {
  const [at, setAt] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  // 横スクロールの位置から、いま何枚目かを出す（ドットの点灯用）
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== at) setAt(i);
  };

  return (
    <div className="photo-feed">
      <div className="photo-rail" ref={track} onScroll={onScroll} data-hswipe>
        {images.map((im, i) => {
          const land = im.w > im.h;
          return (
            <div className="photo-slide" key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={`fv${land ? " fv-land" : ""}`} src={im.url} alt="" draggable={false}
                loading={i <= at + 1 ? "eager" : "lazy"} />
            </div>
          );
        })}
      </div>
      {images.length > 1 && (
        <div className="photo-dots" aria-hidden="true">
          <span className="photo-count">{at + 1}/{images.length}</span>
          <div className="photo-dotrow">
            {images.map((_, i) => <span key={i} className={i === at ? "on" : ""} />)}
          </div>
        </div>
      )}
      {!active && <div className="photo-pausehint" aria-hidden="true" />}
    </div>
  );
}
