"use client";
import { useEffect, useRef, useState } from "react";

/**
 * 写真投稿の表示。横スワイプで複数枚を見る。
 * なめらかさのため、スクロールではなく transform（GPU合成）で動かす。
 * 実際の指の動きはフィード側（usePager）が data-hswipe の中の .photo-track を
 * 直接動かし、何枚目かは "photoindex" イベントで受け取ってドットを更新する。
 */
export function PhotoCarousel({ images, active }: {
  images: { url: string; w: number; h: number }[];
  active: boolean;
}) {
  const [at, setAt] = useState(0);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const onIdx = (e: Event) => setAt((e as CustomEvent<number>).detail);
    el.addEventListener("photoindex", onIdx as EventListener);
    return () => el.removeEventListener("photoindex", onIdx as EventListener);
  }, []);

  return (
    <div className="photo-feed">
      <div className="photo-rail" data-hswipe data-count={images.length} ref={rail}>
        <div className="photo-track">
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
