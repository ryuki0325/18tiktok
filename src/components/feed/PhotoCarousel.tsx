"use client";
import { useRef, useState } from "react";

/**
 * 写真投稿の表示。横スワイプで複数枚を見る（縦スワイプは外側のフィードが拾う）。
 * フィード側に touch-action:none がかかっていてブラウザの横スクロールが効かないため、
 * 横の送りは pointer イベントで自前に動かす（縦の指はフィードのページ送りに任せる）。
 */
export function PhotoCarousel({ images, active }: {
  images: { url: string; w: number; h: number }[];
  active: boolean;
}) {
  const [at, setAt] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  // ドラッグ中の状態。dir が決まるまでは縦か横かを見極める
  const drag = useRef<{ id: number; x: number; y: number; scroll: number; dir: "h" | "v" | null } | null>(null);

  const syncAt = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== at) setAt(i);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (images.length < 2) return;
    const el = track.current;
    if (!el) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, scroll: el.scrollLeft, dir: null };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = track.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.dir) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        d.dir = "h";
        try { el.setPointerCapture(d.id); } catch {}
        el.style.scrollSnapType = "none";
      } else if (Math.abs(dy) > 8) {
        // 縦の指はフィードのページ送りに任せる
        drag.current = null;
        return;
      } else return;
    }
    if (d.dir === "h") {
      e.preventDefault();
      el.scrollLeft = d.scroll - dx;
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = track.current;
    drag.current = null;
    if (!d || !el || e.pointerId !== d.id) return;
    if (d.dir === "h") {
      const i = Math.max(0, Math.min(images.length - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
      el.style.scrollSnapType = "x mandatory";
      el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
      setAt(i);
    }
  };

  return (
    <div className="photo-feed">
      <div className="photo-rail" ref={track} onScroll={syncAt} data-hswipe
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
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
