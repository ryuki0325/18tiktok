/** 読み込み中の仮の枠（真っ白・真っ黒で待たせない） */
export function FeedSkeleton() {
  return (
    <div className="pager" aria-busy="true" aria-label="読み込み中">
      <div className="item" style={{ top: 0 }}><div className="sk-video" /><div className="pull" style={{ opacity: 1, transform: "translate3d(-50%, 40vh, 0)" }}><span className="spinner spin" /></div></div>
    </div>
  );
}

export function PageSkeleton({ grid = false }: { grid?: boolean }) {
  return (
    <div className="screen" aria-busy="true" aria-label="読み込み中">
      <div className="navbar"><span className="sp44" /><span className="sk" style={{ width: 120, height: 18, margin: "0 auto" }} /><span className="sp44" /></div>
      <div className="sec" style={{ gap: 14 }}>
        <span className="sk" style={{ height: 48, borderRadius: 999 }} />
        {grid ? (
          <div className="thumbs" style={{ margin: "0 -13px" }}>{Array.from({ length: 9 }, (_, i) => <span key={i} className="sk" style={{ aspectRatio: "9/14", borderRadius: 6 }} />)}</div>
        ) : (
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="sk" style={{ width: 56, height: 72, borderRadius: 10, flexShrink: 0 }} />
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><span className="sk" style={{ height: 14, width: "70%" }} /><span className="sk" style={{ height: 12, width: "40%" }} /></span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
