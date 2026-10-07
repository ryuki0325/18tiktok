"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

/**
 * 写真の全画面表示：切らずに全体（object-fit: contain）を見せる。横スワイプで複数枚。
 * 端末の「戻る」操作でも閉じられるよう、履歴を1つ積む。
 */
export function PhotoFullscreen({ images, startAt = 0, onClose }: {
  images: { url: string; w: number; h: number }[];
  startAt?: number;
  onClose: () => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(startAt);
  const closed = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const finish = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    // 開いた瞬間に、選んでいた写真の位置へ
    const el = rail.current;
    if (el) el.scrollLeft = startAt * el.clientWidth;
    if (!history.state?.glowPhotoFs) history.pushState({ ...history.state, glowPhotoFs: 1 }, "");
    const pop = () => finish();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") history.back(); };
    window.addEventListener("popstate", pop);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("popstate", pop); window.removeEventListener("keydown", key); };
  }, [finish, startAt]);

  const onScroll = () => {
    const el = rail.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== at) setAt(i);
  };

  return (
    <div className="fs photo-fs" role="dialog" aria-modal="true" aria-label="写真の全画面表示">
      <div className="photo-fs-rail" ref={rail} onScroll={onScroll}>
        {images.map((im, i) => (
          <div className="photo-fs-slide" key={i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url} alt="" draggable={false} />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="photo-dots" aria-hidden="true">
          <span className="photo-count">{at + 1}/{images.length}</span>
          <div className="photo-dotrow">
            {images.map((_, i) => <span key={i} className={i === at ? "on" : ""} />)}
          </div>
        </div>
      )}
      <button className="fs-back" aria-label="戻る" onClick={() => history.back()}><Icon name="back" size={26} /></button>
    </div>
  );
}
