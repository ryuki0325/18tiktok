import { cssVars, videoTokens, type CustomColors, type ThemeId, type Tokens } from "@/lib/theme";
import { Icon } from "../Icon";

/** テーマのプレビュー：実際のフィードと同じクラスで描いた縮小版（色だけが変わる） */
export function MiniFeed({ tokens, id, custom, scale = 0.36, hue = [285, 320, 250] }: { tokens: Tokens; id: ThemeId; custom: CustomColors; scale?: number; hue?: [number, number, number] }) {
  const style = { ...cssVars(tokens), ...cssVars(videoTokens(id, custom)) } as React.CSSProperties;
  const [a, b, c] = hue;
  return (
    <div className="mini" style={{ width: Math.round(393 * scale), height: Math.round(852 * scale) }} aria-label="テーマのプレビュー" role="img">
      <div className="scaled" style={{ transform: `scale(${scale})`, ...style }}>
        <div className="item" style={{ background: "#07070B" }}>
          <div className="vid" style={{ background: `radial-gradient(70% 50% at 50% 40%, hsl(${a} 40% 16%), #050508)` }}>
            <i style={{ width: "95%", height: "65%", left: "-5%", top: "10%", background: `radial-gradient(closest-side, hsl(${a} 80% 50% / .8), transparent)` }} />
            <i style={{ width: "85%", height: "60%", right: "-10%", top: "35%", background: `radial-gradient(closest-side, hsl(${b} 85% 52% / .7), transparent)` }} />
            <i style={{ width: "70%", height: "45%", left: "22%", top: "0%", background: `radial-gradient(closest-side, hsl(${c} 70% 62% / .5), transparent)` }} />
          </div>
          <div className="scrim" />
          <div className="ov">
            <div className="rail">
              <span className="av" style={{ background: `linear-gradient(135deg,hsl(${a} 55% 55%),hsl(${b} 60% 35%))` }} />
              <span className="on" style={{ display: "flex", flexDirection: "column", alignItems: "center", fontSize: 11, fontWeight: 600 }}><span className="hit"><Icon name="heart" size={30} filled /></span>12.3万</span>
              {(["msg", "bookmark", "send", "flag"] as const).map((n) => <span key={n} className="hit" style={{ display: "grid" }}><Icon name={n} size={28} /></span>)}
            </div>
            <div className="vinfo"><b className="h">@luna_night</b><p>雨上がりの夜、ネオンが滲む窓辺で。少しだけ特別な時間を。</p><div className="tags"><span>#大人の時間</span><span>#ラウンジ</span></div></div>
            <div className="ctawrap"><span className="cta">本編を見る <Icon name="arrowR" size={20} stroke={2.2} /><span className="pr">PR</span></span></div>
          </div>
          <div className="progress"><i style={{ width: "38%", animation: "none" }} /></div>
        </div>
        <div className="feedtop"><span className="l"><Icon name="volx" size={22} /></span><nav className="tabs"><a aria-selected="true">おすすめ</a><a>人気</a><a>フォロー中</a></nav><span className="r"><Icon name="search" /></span></div>
        <nav className="tabbar on-video" style={{ height: 56, bottom: 0 }}>
          <a aria-current="page"><Icon name="house" filled /><span>ホーム</span></a><a><Icon name="compass" /><span>探す</span></a>
          <a><span className="plus"><Icon name="plus" size={22} stroke={2.2} /></span></a><a><Icon name="bookmark" /><span>お気に入り</span></a><a><Icon name="user" /><span>マイページ</span></a>
        </nav>
      </div>
    </div>
  );
}
