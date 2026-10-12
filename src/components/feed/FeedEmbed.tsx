"use client";
import { useState } from "react";
import { Icon } from "../Icon";

/**
 * フィード用の埋め込みプレイヤー。
 * 動画は自社に保存せず、公式サンプル等の出どころ（提携先の公式サーバー）から iframe で再生する。
 * - 表示が近い（active / next）ときだけ iframe を読み込む（通信とバッテリーの節約）。
 * - 離れたら iframe を外して再生を止める（次の人の動画が勝手に鳴り続けないように）。
 * - 16:9 で中央に収め、上下は暗い背景にする（縦画面でも崩れないように）。
 */
const SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

export function FeedEmbed({ src, active, near }: { src: string; active: boolean; near: boolean }) {
  const [loaded, setLoaded] = useState(false);
  // 近い（active / next）ときだけ iframe を置く。離れたら外して再生を止める。
  const mounted = near;
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
