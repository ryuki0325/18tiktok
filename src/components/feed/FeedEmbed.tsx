"use client";
import { useState } from "react";
import { Icon } from "../Icon";

/**
 * フィード用の埋め込みプレイヤー。
 * 動画は自社に保存せず、公式サンプル等の出どころ（提携先の公式サーバー）から iframe で再生する。
 * - 表示中（active）のときだけ iframe を置いて自動再生する（複数が同時に鳴らないように、active 限定）。
 * - 離れたら iframe を外して再生を止める。
 * - 縦画面いっぱいに表示（はみ出しは切り取り）。縦向きの動画はぴったり、横向きは中央を大きく。
 */
const SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

export function FeedEmbed({ src, active }: { src: string; active: boolean; near?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  // 表示中のカードだけ iframe を置く（自動再生が複数同時に走らないように）。離れたら外して止める。
  const mounted = active;
  return (
    <div className="fembed" aria-hidden={!active}>
      {mounted ? (
        <iframe
          className="fembed-frame"
          src={src}
          loading="lazy"
          sandbox={SANDBOX}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer-when-downgrade"
          title="埋め込み動画"
          onLoad={() => setLoaded(true)}
        />
      ) : null}
      {(!mounted || !loaded) && (
        <span className="fembed-wait" aria-hidden="true">
          <span className="spinner spin" />
          <span className="fembed-note"><Icon name="shield" size={13} /> 公式の出どころから再生</span>
        </span>
      )}
    </div>
  );
}
