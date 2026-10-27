"use client";
import type { FeedPromo } from "@/lib/promos";
import { Icon } from "../Icon";
import { FeedEmbed } from "./FeedEmbed";
import { FeedVideo } from "./FeedVideo";

/**
 * フィードに差し込む広告・アフィリ枠の1スライド。
 * - affiliate / sponsor：画像＋見出し＋CTAボタン（タップで記録して遷移先を開く）。全面スワイプ可。
 * - network：広告ネットワークのコードを隔離iframe（sandbox）で中央カード表示。
 *   iframeがタッチを奪っても、上下の余白で次の動画へスワイプできるようにする。
 */
export function PromoSlide({ p, i, active, onOpen }: { p: FeedPromo; i: number; active: boolean; onOpen: (p: FeedPromo) => void }) {
  const top = `${i * 100}%`;

  if (p.kind === "network") {
    // active のときだけ広告コードを流し込む（表示していない枠で広告を読み込まない＝通信節約）。
    // 固定サイズの広告（例：960x1200）は枠に収まるよう自動で縮小する。
    const doc = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}body{display:grid;place-items:center}#w{transform-origin:center center}</style><body><div id="w">${active ? (p.html ?? "") : ""}</div><script>(function(){function f(){var w=document.getElementById('w');if(!w||!w.firstElementChild)return;var e=w.firstElementChild;var cw=e.offsetWidth||parseInt(e.getAttribute('width'))||0;var ch=e.offsetHeight||parseInt(e.getAttribute('height'))||0;if(!cw||!ch)return;var s=Math.min(innerWidth/cw,innerHeight/ch);if(isFinite(s)&&s<1)w.style.transform='scale('+s+')';}addEventListener('load',f);setTimeout(f,300);setTimeout(f,1500);})();</script></body>`;
    return (
      <article className="item promo-item" data-promo={p.id} style={{ top }} aria-hidden={!active} onContextMenu={(e) => e.preventDefault()}>
        <span className="promo-bg promo-bg-grad" aria-hidden="true" />
        <span className="promo-label">{p.label || "広告"}</span>
        <div className="promo-net">
          <iframe
            className="promo-net-frame"
            title="広告"
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
            referrerPolicy="no-referrer"
            srcDoc={doc}
          />
        </div>
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
