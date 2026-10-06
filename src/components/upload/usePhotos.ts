"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type Photo = {
  key: string;
  /** アップロード中のプレビュー（端末内のURL）。完了後も表示に使う */
  previewUrl: string;
  /** サーバーに保存できたら入る */
  url: string | null;
  w: number;
  h: number;
  state: "uploading" | "ready" | "failed";
};

/** 画像を長辺1440pxまで縮めてJPEGにする（端末内で処理し、そのままサーバーに送る） */
const MAX_SIDE = 1440;
function shrink(file: File): Promise<{ dataUrl: string; w: number; h: number; preview: string }> {
  return new Promise((resolve, reject) => {
    const preview = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) { reject(new Error("no ctx")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: c.toDataURL("image/jpeg", 0.82), w, h, preview });
    };
    img.onerror = () => { URL.revokeObjectURL(preview); reject(new Error("画像を読み込めませんでした")); };
    img.src = preview;
  });
}

export function usePhotos({ max, onChange, initial }: {
  max: number;
  onChange: (ready: { url: string; w: number; h: number }[]) => void;
  /** 下書きの続きから開いたとき、保存済みの画像を最初から並べる */
  initial?: { url: string; w: number; h: number }[] | null;
}) {
  // 保存済みの画像は、プレビューにそのサーバーURLをそのまま使う（state は ready）
  const [photos, setPhotos] = useState<Photo[]>(() =>
    (initial ?? []).map((im) => ({ key: crypto.randomUUID(), previewUrl: im.url, url: im.url, w: im.w, h: im.h, state: "ready" as const })));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const emit = useCallback((list: Photo[]) => {
    onChangeRef.current(list.filter((p) => p.state === "ready" && p.url).map((p) => ({ url: p.url!, w: p.w, h: p.h })));
  }, []);

  // 下書きの続きで最初から入っている画像は、編集しなくてもフォームに渡しておく
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (initial?.length) emit(initial.map((im) => ({ key: "", previewUrl: im.url, url: im.url, w: im.w, h: im.h, state: "ready" as const })));
  }, [initial, emit]);

  const add = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    let room = max - photos.length;
    for (const file of imgs) {
      if (room-- <= 0) break;
      const key = crypto.randomUUID();
      let shrunk: { dataUrl: string; w: number; h: number; preview: string };
      try { shrunk = await shrink(file); } catch { continue; }
      setPhotos((cur) => [...cur, { key, previewUrl: shrunk.preview, url: null, w: shrunk.w, h: shrunk.h, state: "uploading" }]);
      try {
        const r = await fetch("/api/v1/images", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ dataUrl: shrunk.dataUrl, w: shrunk.w, h: shrunk.h }),
        }).then((x) => x.json());
        setPhotos((cur) => {
          const next = cur.map((p) => (p.key === key
            ? (r?.url ? { ...p, url: r.url, w: r.w, h: r.h, state: "ready" as const } : { ...p, state: "failed" as const })
            : p));
          emit(next);
          return next;
        });
      } catch {
        setPhotos((cur) => cur.map((p) => (p.key === key ? { ...p, state: "failed" as const } : p)));
      }
    }
  }, [max, photos.length, emit]);

  const remove = useCallback((key: string) => {
    setPhotos((cur) => {
      const gone = cur.find((p) => p.key === key);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      const next = cur.filter((p) => p.key !== key);
      emit(next);
      return next;
    });
  }, [emit]);

  const reset = useCallback(() => {
    setPhotos((cur) => { cur.forEach((p) => URL.revokeObjectURL(p.previewUrl)); return []; });
    onChangeRef.current([]);
  }, []);

  const uploading = photos.some((p) => p.state === "uploading");
  const readyCount = photos.filter((p) => p.state === "ready").length;
  return { photos, add, remove, reset, uploading, readyCount };
}
