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

/**
 * フィードでは必ず自動再生（ミュート・インライン）にする。投稿時に付け忘れた古いURLでも、
 * ここで主要プロバイダに自動再生パラメータを足す（YouTube/Vimeo/Dailymotion）。
 */
function withAutoplay(src: string): string {
  try {
    const u = new URL(src);
    const h = u.hostname.replace(/^www\./, "").toLowerCase();
    if (h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtube-nocookie.com") {
      u.searchParams.set("autoplay", "1"); u.searchParams.set("mute", "1"); u.searchParams.set("playsinline", "1"); u.searchParams.set("rel", "0");
    } else if (h === "player.vimeo.com") {
      u.searchParams.set("autoplay", "1"); u.searchParams.set("muted", "1"); u.searchParams.set("playsinline", "1");
    } else if (h.endsWith("dailymotion.com")) {
      u.searchParams.set("autoplay", "1"); u.searchParams.set("mute", "1");
    }
    return u.toString();
  } catch { return src; }
}

export function FeedEmbed({ src, active, fit = "cover" }: { src: string; active: boolean; fit?: "cover" | "contain"; near?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  // 表示中のカードだけ iframe を置く（自動再生が複数同時に走らないように）。離れたら外して止める。
  const mounted = active;
  return (
    <div className={`fembed${fit === "contain" ? " contain" : ""}`} aria-hidden={!active}>
      {mounted ? (
        <iframe
          className="fembed-frame"
          src={withAutoplay(src)}
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
