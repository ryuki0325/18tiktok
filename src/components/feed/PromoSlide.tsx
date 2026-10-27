"use client";
import { useEffect, useRef } from "react";
import type { FeedPromo } from "@/lib/promos";
import { Icon } from "../Icon";
import { FeedEmbed } from "./FeedEmbed";
import { FeedVideo } from "./FeedVideo";

/** 広告コードから元のサイズ（width/height）を読む。無ければ 300x250。 */
function adSize(html: string | null): [number, number] {
  const w = parseInt(html?.match(/width\s*=\s*["']?(\d+)/i)?.[1] ?? "", 10);
  const h = parseInt(html?.match(/height\s*=\s*["']?(\d+)/i)?.[1] ?? "", 10);
  return [Number.isFinite(w) && w > 0 ? w : 300, Number.isFinite(h) && h > 0 ? h : 250];
}

const NET_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms";

/**
 * 広告ネットワーク（DTI等のHTML広告）。隔離iframeに元サイズで描画し、親側で枠に収まるよう縮小する。
 * iframe は中身を自動で縮小しないため、iframe 要素自体を transform: scale で拡大縮小するのが確実。
 */
function NetworkAd({ p, active }: { p: FeedPromo; active: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, h] = adSize(p.html);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const frame = box.querySelector("iframe") as HTMLElement | null;
    const fit = () => {
      if (!frame) return;
      const s = Math.min(box.clientWidth / w, box.clientHeight / h) || 1;
      frame.style.transform = `translate(-50%, -50%) scale(${s})`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [w, h]);
  const doc = `<!doctype html><meta charset="utf-8"><body style="margin:0;overflow:hidden;background:#000">${active ? (p.html ?? "") : ""}</body>`;
  return (
    <div className="promo-net" ref={boxRef}>
      <iframe
        className="promo-net-frame"
        title="広告"
        width={w}
        height={h}
        style={{ position: "absolute", left: "50%", top: "50%", width: w, height: h, transformOrigin: "center center", transform: "translate(-50%, -50%)" }}
        sandbox={NET_SANDBOX}
        referrerPolicy="no-referrer"
        srcDoc={doc}
      />
    </div>
  );
}

/**
 * フィードに差し込む広告・アフィリ枠の1スライド。
 * - affiliate / sponsor：動画／埋め込み／画像（全体表示）＋見出し＋CTA（タップで記録して遷移先を開く）。
 * - network：広告ネットワークのコードを隔離iframeで中央カード表示（枠に収まるよう自動縮小）。
 */
export function PromoSlide({ p, i, active, onOpen }: { p: FeedPromo; i: number; active: boolean; onOpen: (p: FeedPromo) => void }) {
  const top = `${i * 100}%`;

  if (p.kind === "network") {
    return (
      <article className="item promo-item" data-promo={p.id} style={{ top }} aria-hidden={!active} onContextMenu={(e) => e.preventDefault()}>
        <span className="promo-bg promo-bg-grad" aria-hidden="true" />
        <span className="promo-label">{p.label || "広告"}</span>
        <NetworkAd p={p} active={active} />
        <span className="promo-net-hint"><Icon name="chev" size={14} /> 上下にスワイプで次へ</span>
      </article>
    );
  }

  return (
    <article className="item promo-item" data-promo={p.id} style={{ top }} aria-hidden={!active} onContextMenu={(e) => e.preventDefault()}>
      {/* 背景フィル：画像があればそれをぼかして敷く（端末比率が違っても黒帯が目立たず、全体表示でも自然） */}
      {p.imageUrl
        ? <span className="promo-blur" style={{ backgroundImage: `url("${p.imageUrl.replace(/"/g, "%22")}")` }} aria-hidden="true" />
        : <span className="promo-bg promo-bg-grad" aria-hidden="true" />}
      {/* 主役メディア：全体表示（contain）＝どの端末でも切れずに全部見える。動画 ＞ 埋め込み ＞ 画像 */}
      {p.videoUrl
        ? <FeedVideo src={p.videoUrl} poster={p.imageUrl} width={null} height={null} active={active} paused={!active} muted rate={1} preload={active ? "active" : "idle"} contain />
        : p.embedUrl
          ? <FeedEmbed src={p.embedUrl} active={active} fit="contain" />
          : p.imageUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className="promo-media" src={p.imageUrl} alt="" aria-hidden="true" />
            : null}
      {/* スクリム：埋め込みiframeの上でスワイプ／タップを拾う（CTAはこの上に出す） */}
      <span className="promo-scrim" aria-hidden="true" />
      <span className="promo-label">{p.label || "PR"}</span>
      <div className="promo-body">
        {p.title && <h2 className="promo-title">{p.title}</h2>}
        {p.body && <p className="promo-sub">{p.body}</p>}
        <button type="button" className="promo-cta" onClick={() => onOpen(p)}>
          {p.ctaText || "詳しく見る"} <Icon name="arrowR" size={20} stroke={2.2} />
        </button>
      </div>
    </article>
  );
}
