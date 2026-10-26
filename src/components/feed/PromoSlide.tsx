"use client";
import type { FeedPromo } from "@/lib/promos";
import { Icon } from "../Icon";
import { FeedEmbed } from "./FeedEmbed";

/**
 * フィードに差し込む広告・アフィリ枠の1スライド。
 * - affiliate / sponsor：画像＋見出し＋CTAボタン（タップで記録して遷移先を開く）。全面スワイプ可。
 * - network：広告ネットワークのコードを隔離iframe（sandbox）で中央カード表示。
 *   iframeがタッチを奪っても、上下の余白で次の動画へスワイプできるようにする。
 */
export function PromoSlide({ p, i, active, onOpen }: { p: FeedPromo; i: number; active: boolean; onOpen: (p: FeedPromo) => void }) {
  const top = `${i * 100}%`;

  if (p.kind === "network") {
    // active のときだけ広告コードを流し込む（表示していない枠で広告を読み込まない＝通信節約）
    const doc = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#000;overflow:hidden">${active ? (p.html ?? "") : ""}</body>`;
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
      {/* 背景：埋め込み動画（配信中の映像・公式サンプル等） ＞ 画像 ＞ グラデ */}
      {p.embedUrl
        ? <FeedEmbed src={p.embedUrl} active={active} fit="cover" />
        : p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="promo-bg" src={p.imageUrl} alt="" aria-hidden="true" />
          : <span className="promo-bg promo-bg-grad" aria-hidden="true" />}
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
