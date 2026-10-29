/** 動画のプレースホルダー：抽象的な光のみ（実際の動画配信は後のフェーズ）。blurフィルタを使わない軽量版 */
const blob = (h: number, s: number, l: number, a: number) => `radial-gradient(closest-side, hsl(${h} ${s}% ${l}% / ${a}), transparent)`;

export function VideoBackdrop({ hue, live = false }: { hue: [number, number, number]; live?: boolean; still?: boolean; soft?: boolean }) {
  const [a, b, c] = hue;
  return (
    <>
      <div className={`vid${live ? " live" : ""}`} style={{ background: `radial-gradient(140% 115% at 50% 44%, hsl(${a} 46% 23%), hsl(${a} 34% 10%))` }} aria-hidden="true">
        <i style={{ width: "95%", height: "65%", left: "-5%", top: "4%", background: blob(a, 80, 50, 0.8) }} />
        <i style={{ width: "90%", height: "62%", right: "-12%", top: "30%", background: blob(b, 85, 52, 0.72) }} />
        <i style={{ width: "72%", height: "48%", left: "20%", top: "-2%", background: blob(c, 72, 62, 0.5) }} />
        {/* 下側も色で満たす（プレースホルダーの下部が暗く空いて見えないように） */}
        <i style={{ width: "125%", height: "62%", left: "-12%", bottom: "-14%", background: blob(b, 74, 46, 0.6) }} />
        <i style={{ width: "85%", height: "42%", right: "-8%", bottom: "2%", background: blob(a, 78, 52, 0.42) }} />
      </div>
    </>
  );
}

export function Avatar({ hue, size = 40 }: { hue: number; size?: number }) {
  return <span className="pav" style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 55% 55%), hsl(${(hue + 40) % 360} 60% 35%))` }} />;
}

/** 一覧のサムネイル：サムネイル画像（CDN）があれば画像、なければ抽象プレースホルダー */
export function Thumb({ card }: { card: { hue: [number, number, number]; poster: string | null } }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (card.poster) return <img className="timg" src={card.poster} alt="" loading="lazy" decoding="async" />;
  return <VideoBackdrop hue={card.hue} still soft />;
}
