/** 動画のプレースホルダー：抽象的な光のみ（実際の動画配信は後のフェーズ）。blurフィルタを使わない軽量版 */
const blob = (h: number, s: number, l: number, a: number) => `radial-gradient(closest-side, hsl(${h} ${s}% ${l}% / ${a}), transparent)`;

export function VideoBackdrop({ hue, live = false }: { hue: [number, number, number]; live?: boolean; still?: boolean; soft?: boolean }) {
  const [a, b, c] = hue;
  return (
    <>
      <div className={`vid${live ? " live" : ""}`} style={{ background: `radial-gradient(70% 50% at 50% 40%, hsl(${a} 40% 16%), #050508)` }} aria-hidden="true">
        <i style={{ width: "95%", height: "65%", left: "-5%", top: "10%", background: blob(a, 80, 50, 0.8) }} />
        <i style={{ width: "85%", height: "60%", right: "-10%", top: "35%", background: blob(b, 85, 52, 0.7) }} />
        <i style={{ width: "70%", height: "45%", left: "22%", top: "0%", background: blob(c, 70, 62, 0.5) }} />
        <i style={{ width: "110%", height: "45%", left: "-5%", bottom: "-5%", background: blob(a, 60, 28, 0.85) }} />
      </div>
    </>
  );
}

export function Avatar({ hue, size = 40 }: { hue: number; size?: number }) {
  return <span className="pav" style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 55% 55%), hsl(${(hue + 40) % 360} 60% 35%))` }} />;
}
