/** プロフィール写真。未設定なら、その人の色でできた丸を出す */
export function ProfileAvatar({ hue, url, size = 44, className }: { hue: number; url?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size } as React.CSSProperties;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`pav${className ? " " + className : ""}`} src={url} alt="" width={size} height={size} style={style} loading="lazy" decoding="async" />;
  }
  return <span className={`pav${className ? " " + className : ""}`} style={{ ...style, background: `linear-gradient(135deg, hsl(${hue} 55% 55%), hsl(${(hue + 40) % 360} 60% 35%))` }} />;
}
