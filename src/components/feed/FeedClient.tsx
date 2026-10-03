"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { VideoCard } from "@/lib/content";
import { Icon } from "../Icon";
import { VideoBackdrop } from "../VideoBackdrop";
import { fmt } from "../format";
import { useToast } from "../Toast";
import { api } from "./api";
import { CommentSheet, MoreSheet, ReportSheet, ShareSheet } from "./Sheets";

type Sheet = { kind: "report" | "comment" | "share" | "more"; card: VideoCard } | null;
const TABS = [["recommended", "おすすめ"], ["popular", "人気"], ["following", "フォロー中"]] as const;

const noopSubscribe = () => () => {};
const readMuted = () => { try { return localStorage.getItem("glow.muted") !== "0"; } catch { return true; } };

/** 何本先まで描画するか（前後1本＝TikTok同様に次の動画を先読み、それ以外は空の箱だけ置く） */
const WINDOW = 1;
/** 残り何本になったら次を読み込むか */
const PREFETCH_AT = 3;

export function FeedClient({ cards: initial, tab, loggedIn, myId, hasMore: initialHasMore }: { cards: VideoCard[]; tab: string; loggedIn: boolean; myId: string | null; hasMore: boolean }) {
  const [cards, setCards] = useState(initial);
  const [active, setActive] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const loading = useRef(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const storedMuted = useSyncExternalStore(noopSubscribe, readMuted, () => true);
  const [mutedOverride, setMuted] = useState<boolean | null>(null);
  const muted = mutedOverride ?? storedMuted;
  const [paused, setPaused] = useState<Record<string, boolean>>({});
  const [uiHidden, setUiHidden] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const router = useRouter();


  // 今どの動画が画面にあるか（スクロール位置から計算。rAFで間引き）
  useEffect(() => {
    const f = feedRef.current;
    if (!f) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setActive(Math.round(f.scrollTop / Math.max(1, f.clientHeight))));
    };
    f.addEventListener("scroll", onScroll, { passive: true });
    return () => { f.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [cards.length]);

  // 残りが少なくなったら次のページを先に読み込む（無限スクロール）
  useEffect(() => {
    if (!hasMore || loading.current || cards.length - active > PREFETCH_AT) return;
    loading.current = true;
    api<{ videos: VideoCard[]; nextOffset: number | null }>(`/api/v1/feed?tab=${tab}&offset=${cards.length}`).then((r) => {
      loading.current = false;
      if (!r.ok) return;
      setCards((cs) => { const seen = new Set(cs.map((c) => c.id)); return [...cs, ...r.data.videos.filter((v) => !seen.has(v.id))]; });
      setHasMore(r.data.nextOffset !== null);
    });
  }, [active, cards.length, hasMore, tab]);

  // 動画がある場合：表示中の1本だけ再生し、ほかは止める（次の1本は preload 済み）
  useEffect(() => {
    feedRef.current?.querySelectorAll<HTMLVideoElement>("video").forEach((v) => {
      const i = Number(v.dataset.index);
      if (i === active && !paused[cards[i]?.id]) void v.play().catch(() => {});
      else v.pause();
      v.muted = muted;
    });
  }, [active, paused, muted, cards]);

  // 2秒以上表示されたら再生として記録（サーバー側で重複・bot・本人を除外）
  const viewed = useRef(new Set<string>());
  useEffect(() => {
    const c = cards[active];
    if (!c || viewed.current.has(c.id)) return;
    const t = setTimeout(() => { viewed.current.add(c.id); void api(`/api/v1/videos/${c.id}/view`, { method: "POST", body: {} }); }, 2000);
    return () => clearTimeout(t);
  }, [active, cards]);

  const step = useCallback((d: number) => {
    const f = feedRef.current;
    if (!f) return;
    const i = Math.max(0, Math.min(f.children.length - 1, Math.round(f.scrollTop / f.clientHeight) + d));
    f.scrollTo({ top: i * f.clientHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || /INPUT|TEXTAREA|SELECT/.test((document.activeElement?.tagName ?? ""))) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); step(1); }
      if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", onKey);
    const f = feedRef.current;
    let lock = false;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); if (lock || Math.abs(e.deltaY) < 8) return; lock = true; step(e.deltaY > 0 ? 1 : -1); setTimeout(() => (lock = false), 550); };
    f?.addEventListener("wheel", onWheel, { passive: false });
    return () => { window.removeEventListener("keydown", onKey); f?.removeEventListener("wheel", onWheel); };
  }, [sheet, step]);

  // タップで停止/再生、長押しでUIを隠す
  const press = useRef<{ t: ReturnType<typeof setTimeout> | null; long: boolean; moved: boolean }>({ t: null, long: false, moved: false });
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    press.current.moved = false; press.current.long = false;
    press.current.t = setTimeout(() => { press.current.long = true; setUiHidden(true); }, 450);
  };
  const onUp = (id: string) => (e: React.PointerEvent) => {
    if (press.current.t) clearTimeout(press.current.t);
    if (press.current.long) { setUiHidden(false); return; }
    if (!press.current.moved && !(e.target as HTMLElement).closest("a,button")) setPaused((p) => ({ ...p, [id]: !p[id] }));
  };

  const patch = (id: string, f: (c: VideoCard) => Partial<VideoCard>) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...f(c) } : c)));

  const like = async (c: VideoCard) => {
    patch(c.id, (x) => ({ liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) }));
    const r = await api(`/api/v1/videos/${c.id}/like`, { method: c.liked ? "DELETE" : "PUT" });
    if (!r.ok) patch(c.id, (x) => ({ liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) }));
  };
  const save = async (c: VideoCard) => {
    patch(c.id, (x) => ({ saved: !x.saved }));
    const r = await api(`/api/v1/videos/${c.id}/favorite`, { method: c.saved ? "DELETE" : "PUT" });
    if (r.ok) toast(c.saved ? "保存を解除しました" : loggedIn ? "お気に入りに保存しました" : "この端末のお気に入りに保存しました");
    else patch(c.id, (x) => ({ saved: !x.saved }));
  };
  const follow = async (c: VideoCard) => {
    if (!loggedIn) { toast("フォローするにはログインしてください"); router.push(`/login?next=${encodeURIComponent("/?v=" + c.id)}`); return; }
    if (c.creator.id === myId) { toast("自分はフォローできません"); return; }
    const on = !c.following;
    setCards((cs) => cs.map((x) => (x.creator.id === c.creator.id ? { ...x, following: on } : x)));
    const r = await api(`/api/v1/creators/${c.creator.id}/follow`, { method: on ? "PUT" : "DELETE" });
    if (r.ok) toast(on ? `@${c.creator.handle} をフォローしました` : "フォローを解除しました");
  };
  const toggleMute = () => { const m = !muted; setMuted(m); try { localStorage.setItem("glow.muted", m ? "1" : "0"); } catch {} toast(m ? "音をオフにしました" : "音をオンにしました（設定を記憶します）"); };

  return (
    <div className={`vt${uiHidden ? " ui-hidden" : ""}`}>
      {cards.length ? (
        <div className="feed" ref={feedRef} onPointerMove={() => (press.current.moved = true)}>
          {cards.map((c, i) => {
            const near = Math.abs(i - active) <= WINDOW;
            if (!near) return <article key={c.id} className="item far" data-vid={c.id} aria-hidden="true" />;
            return (
            <article key={c.id} className={`item${i === active ? " active" : ""}${paused[c.id] ? " paused" : ""}`} data-vid={c.id} onPointerDown={onDown} onPointerUp={onUp(c.id)} onPointerCancel={() => press.current.t && clearTimeout(press.current.t)}>
              {c.src
                ? <video data-index={i} src={c.src} playsInline loop muted={muted} preload={i === active ? "auto" : "metadata"} disablePictureInPicture controlsList="nodownload noplaybackrate" onContextMenu={(e) => e.preventDefault()} />
                : <VideoBackdrop hue={c.hue} live={i === active && !paused[c.id]} />}
              <div className="scrim" />
              <div className="center-ind"><Icon name="play" size={30} filled /></div>
              <div className="ov">
                <div className="rail">
                  <span style={{ position: "relative" }}>
                    <Link href={`/u/${encodeURIComponent(c.creator.handle)}`} aria-label={`@${c.creator.handle} のページ`} className="av" style={{ background: `linear-gradient(135deg, hsl(${c.creator.avatarHue} 55% 55%), hsl(${(c.creator.avatarHue + 40) % 360} 60% 35%))` }} />
                    {c.creator.id !== myId && (
                      <button className={`f${c.following ? " done" : ""}`} onClick={() => follow(c)} aria-label={c.following ? "フォロー中" : "フォローする"} aria-pressed={c.following}
                        style={{ position: "absolute", left: "50%", bottom: 1, transform: "translateX(-50%)", width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", background: c.following ? "#fff" : "var(--fill)", color: c.following ? "#111" : "var(--on)" }}>
                        <Icon name={c.following ? "check" : "plus"} size={13} stroke={2.6} />
                      </button>
                    )}
                  </span>
                  <button className={c.liked ? "on" : ""} aria-pressed={c.liked} aria-label="いいね" onClick={() => like(c)}><span className="hit"><Icon name="heart" size={30} filled={c.liked} /></span><span className="num">{fmt(c.likes)}</span></button>
                  <button aria-label="コメント" onClick={() => setSheet({ kind: "comment", card: c })}><span className="hit"><Icon name="msg" size={28} /></span><span className="num">{fmt(c.comments)}</span></button>
                  <button className={c.saved ? "on" : ""} aria-pressed={c.saved} aria-label="保存" onClick={() => save(c)}><span className="hit"><Icon name="bookmark" size={28} filled={c.saved} /></span><span>保存</span></button>
                  <button aria-label="シェア" onClick={() => setSheet({ kind: "share", card: c })}><span className="hit"><Icon name="send" size={27} /></span><span>シェア</span></button>
                  <button aria-label="通報" onClick={() => setSheet({ kind: "report", card: c })}><span className="hit"><Icon name="flag" size={27} /></span><span>通報</span></button>
                  <button aria-label="その他" onClick={() => setSheet({ kind: "more", card: c })}><span className="hit"><Icon name="more" size={28} /></span></button>
                </div>
                <div className="vinfo">
                  <Link className="h" href={`/u/${encodeURIComponent(c.creator.handle)}`}>@{c.creator.handle}</Link>
                  <p>{c.description || c.title}</p>
                  <div className="tags">{c.tags.slice(0, 3).map((t) => <Link key={t} href={`/tags/${encodeURIComponent(t)}`}>#{t}</Link>)}</div>
                </div>
                {c.link && (
                  <div className="ctawrap">
                    <Link className="cta" href={`/out/${c.link.id}`}>本編を見る <Icon name="arrowR" size={20} stroke={2.2} /><span className="pr">PR</span></Link>
                  </div>
                )}
              </div>
              <div className="progress"><i /></div>
            </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-feed" style={{ background: "#07070B" }}>
          <Icon name="user" size={40} />
          <b style={{ fontSize: 17 }}>{tab === "following" ? (loggedIn ? "フォロー中の投稿者はまだいません" : "ログインするとフォロー中の投稿者の動画が届きます") : "まだ動画がありません"}</b>
          <span style={{ color: "rgba(255,255,255,.65)", fontSize: 14 }}>気になる投稿者のアイコンの＋をタップすると、ここに新しい動画が届きます。</span>
          {tab === "following" && !loggedIn ? <Link className="btn btn-primary pill" style={{ width: "auto", padding: "0 22px" }} href="/login?next=/?tab=following">ログイン</Link>
            : <Link className="btn btn-primary pill" style={{ width: "auto", padding: "0 22px" }} href="/">おすすめを見る</Link>}
        </div>
      )}
      <div className="feedtop">
        <button className="l" onClick={toggleMute} aria-label={muted ? "音をオンにする" : "音をオフにする"}><Icon name={muted ? "volx" : "vol"} size={22} /></button>
        <nav className="tabs" role="tablist">
          {TABS.map(([k, l]) => <Link key={k} role="tab" aria-selected={tab === k} href={k === "recommended" ? "/" : `/?tab=${k}`}>{l}</Link>)}
        </nav>
        <Link className="r" href="/search" aria-label="検索"><Icon name="search" /></Link>
      </div>
      {sheet?.kind === "report" && <ReportSheet card={sheet.card} onClose={(hidden) => { setSheet(null); if (hidden) setCards((cs) => cs.filter((x) => x.id !== sheet.card.id)); }} />}
      {sheet?.kind === "comment" && <CommentSheet card={sheet.card} loggedIn={loggedIn} onClose={() => setSheet(null)} onPosted={() => patch(sheet.card.id, (x) => ({ comments: x.comments + 1 }))} />}
      {sheet?.kind === "share" && <ShareSheet card={sheet.card} onClose={() => setSheet(null)} />}
      {sheet?.kind === "more" && <MoreSheet card={sheet.card} onClose={() => setSheet(null)} onReport={() => setSheet({ kind: "report", card: sheet.card })} onHide={() => { setCards((cs) => cs.filter((x) => x.creator.id !== sheet.card.creator.id)); setSheet(null); toast(`@${sheet.card.creator.handle} の動画を表示しません`); }} />}
    </div>
  );
}
