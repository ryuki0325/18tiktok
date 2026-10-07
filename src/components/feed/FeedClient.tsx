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
import { CommentSheet, MoreSheet, RATES, ShareSheet } from "./Sheets";
import { ReportSheet } from "../ReportSheet";
import { FeedVideo, loadHls } from "./FeedVideo";
import { PhotoCarousel } from "./PhotoCarousel";
import { FullscreenView } from "./FullscreenView";
import { PhotoFullscreen } from "./PhotoFullscreen";
import { usePager } from "./usePager";

type Sheet = { kind: "report" | "comment" | "share" | "more"; card: VideoCard } | null;
const TABS = [["recommended", "おすすめ"], ["popular", "人気"], ["following", "フォロー中"]] as const;

const noopSubscribe = () => () => {};
const readMuted = () => { try { return localStorage.getItem("glow.muted") !== "0"; } catch { return true; } };
const readRate = () => { try { const r = Number(localStorage.getItem("glow.rate")); return (RATES as readonly number[]).includes(r) ? r : 1; } catch { return 1; } };

/** 描画するのは今の1本と前後1本だけ（次の動画を先読みしつつ、メモリと描画負荷を一定に保つ） */
const WINDOW = 1;
/** 残り何本になったら次を読み込むか */
const PREFETCH_AT = 3;
const DOUBLE_TAP_MS = 280;

/** 全画面から戻った時、フィードの動画を同じ位置から続ける */
function seekVideo(root: HTMLElement | null, id: string, t: number) {
  const v = root?.querySelector<HTMLVideoElement>(`.item[data-vid="${id}"] video`);
  if (v && t > 0) v.currentTime = t;
}

export function FeedClient({ cards: initial, tab, loggedIn, myId, hasMore: initialHasMore }: { cards: VideoCard[]; tab: string; loggedIn: boolean; myId: string | null; hasMore: boolean }) {
  const [cards, setCards] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const loading = useRef(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const storedMuted = useSyncExternalStore(noopSubscribe, readMuted, () => true);
  const [mutedOverride, setMuted] = useState<boolean | null>(null);
  const muted = mutedOverride ?? storedMuted;
  const storedRate = useSyncExternalStore(noopSubscribe, readRate, () => 1);
  const [rateOverride, setRate] = useState<number | null>(null);
  const rate = rateOverride ?? storedRate;
  const [paused, setPaused] = useState<Record<string, boolean>>({});
  const [fs, setFs] = useState<{ card: VideoCard; t: number } | null>(null);
  const [photoFs, setPhotoFs] = useState<{ images: { url: string; w: number; h: number }[] } | null>(null);
  const searchFocus = useRef<HTMLInputElement>(null);
  const [uiHidden, setUiHidden] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bursts, setBursts] = useState<{ key: number; id: string; x: number; y: number }[]>([]);
  const lastTap = useRef<{ t: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | null }>({ t: 0, x: 0, y: 0, timer: null });
  const toast = useToast();
  const router = useRouter();

  const patch = (id: string, f: (c: VideoCard) => Partial<VideoCard>) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...f(c) } : c)));

  const like = useCallback(async (c: VideoCard) => {
    if (!c.liked) try { navigator.vibrate?.(12); } catch {}
    setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x)));
    const r = await api(`/api/v1/videos/${c.id}/like`, { method: c.liked ? "DELETE" : "PUT" });
    if (!r.ok) setCards((cs) => cs.map((x) => (x.id === c.id ? { ...x, liked: c.liked, likes: c.likes } : x)));
  }, []);

  const refresh = useCallback(async () => {
    const r = await api<{ videos: VideoCard[]; nextOffset: number | null }>(`/api/v1/feed?tab=${tab}&offset=0`);
    if (r.ok) { setCards(r.data.videos); setHasMore(r.data.nextOffset !== null); setPaused({}); toast("新しい動画を読み込みました"); }
  }, [tab, toast]);

  const cardsRef = useRef(cards);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  const { viewportRef, trackRef, pullRef, index, refreshing } = usePager(cards.length, {
    onTap: (x, y, i) => {
      const c = cardsRef.current[i];
      if (!c) return;
      const lt = lastTap.current;
      const now = performance.now();
      if (now - lt.t < DOUBLE_TAP_MS && Math.hypot(x - lt.x, y - lt.y) < 48) {
        // ダブルタップ：その場所にハート、まだならいいね
        if (lt.timer) clearTimeout(lt.timer);
        lt.t = 0;
        const key = now;
        setBursts((b) => [...b, { key, id: c.id, x, y }]);
        setTimeout(() => setBursts((b) => b.filter((z) => z.key !== key)), 750);
        if (!c.liked) void like(c);
        return;
      }
      lt.t = now; lt.x = x; lt.y = y;
      lt.timer = setTimeout(() => setPaused((p) => ({ ...p, [c.id]: !p[c.id] })), DOUBLE_TAP_MS);
    },
    onLongPress: (down) => setUiHidden(down),
    // 横スワイプは写真の送り専用にする。投稿者ページはアイコンのタップで開く

    onRefresh: refresh,
  }, { disabled: !!sheet || !!fs });

  // 残りが少なくなったら次のページを先に読み込む（無限スクロール）
  useEffect(() => {
    if (!hasMore || loading.current || cards.length - index > PREFETCH_AT) return;
    loading.current = true;
    setLoadingMore(true);
    api<{ videos: VideoCard[]; nextOffset: number | null }>(`/api/v1/feed?tab=${tab}&offset=${cards.length}`).then((r) => {
      loading.current = false;
      setLoadingMore(false);
      if (!r.ok) return;
      setCards((cs) => { const seen = new Set(cs.map((c) => c.id)); return [...cs, ...r.data.videos.filter((v) => !seen.has(v.id))]; });
      setHasMore(r.data.nextOffset !== null);
    });
  }, [index, cards.length, hasMore, tab]);

  // HLS の動画があれば、プレイヤー（hls.js）を手の空いた時に先に読み込んでおく。2本先のサムネイルも先読み
  useEffect(() => {
    if (cards.some((c) => c.src?.includes(".m3u8"))) {
      const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300));
      idle(() => void loadHls());
    }
    const far = cards[index + 2];
    if (far?.poster) new Image().src = far.poster;
  }, [cards, index]);

  // 2秒以上表示されたら再生として記録（サーバー側で重複・bot・本人を除外）
  const viewed = useRef(new Set<string>());
  useEffect(() => {
    const c = cards[index];
    if (!c || viewed.current.has(c.id)) return;
    const t = setTimeout(() => { viewed.current.add(c.id); void api(`/api/v1/videos/${c.id}/view`, { method: "POST", body: {} }); }, 2000);
    return () => clearTimeout(t);
  }, [index, cards]);

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
  const block = async (c: VideoCard) => {
    setSheet(null);
    setCards((cs) => cs.filter((x) => x.creator.id !== c.creator.id));
    const r = await api(`/api/v1/me/blocks/${c.creator.id}`, { method: "PUT" });
    toast(r.ok ? `@${c.creator.handle} の動画を表示しません（設定から戻せます）` : "設定できませんでした");
  };
  const notInterested = async (c: VideoCard) => {
    setSheet(null);
    setCards((cs) => cs.filter((x) => x.id !== c.id));
    const r = await api(`/api/v1/videos/${c.id}/not-interested`, { method: "PUT" });
    toast(r.ok ? "この動画を今後おすすめしません" : "設定できませんでした");
  };
  const share = async (c: VideoCard) => {
    const url = `${location.origin}/?v=${c.id}`;
    // スマホは OS の共有メニュー、使えない環境ではリンクのコピー画面
    if (navigator.share) {
      setSheet(null);
      try { await navigator.share({ title: c.title, url }); } catch {}
      return;
    }
    setSheet({ kind: "share", card: c });
  };
  const changeRate = (r: number) => { setRate(r); try { localStorage.setItem("glow.rate", String(r)); } catch {} setSheet(null); toast(r === 1 ? "標準の速度で再生します" : `${r}倍速で再生します`); };
  const openFullscreen = (c: VideoCard) => {
    const v = trackRef.current?.querySelector<HTMLVideoElement>(`.item[data-vid="${c.id}"] video`);
    setFs({ card: c, t: v?.currentTime ?? 0 });
  };
  const closeFullscreen = (t: number) => {
    const id = fs?.card.id;
    setFs(null);
    if (id) seekVideo(trackRef.current, id, t);
  };
  // 検索：先に隠し入力欄にフォーカスしてキーボードを出しておき、「探す」の検索欄に引き継ぐ（iPhoneでも自動でキーボードが出る）
  const goSearch = () => { searchFocus.current?.focus(); router.push("/explore?focus=1"); };
  const toggleMute = () => { const m = !muted; setMuted(m); try { localStorage.setItem("glow.muted", m ? "1" : "0"); } catch {} toast(m ? "音をオフにしました" : "音をオンにしました（設定を記憶します）"); };

  return (
    <div className={`vt${uiHidden ? " ui-hidden" : ""}`}>
      {cards.length ? (
        <div className="pager" ref={viewportRef} aria-roledescription="縦スワイプで動画を切り替え">
          <div className="pull" ref={pullRef} aria-hidden="true"><span className={`spinner${refreshing ? " spin" : ""}`} /></div>
          <div className="track" ref={trackRef}>
            {cards.map((c, i) => {
              if (Math.abs(i - index) > WINDOW) return null;
              const active = i === index;
              return (
                <article key={c.id} className={`item${active ? " active" : ""}${paused[c.id] ? " paused" : ""}${c.src ? " real" : ""}`} data-vid={c.id} style={{ top: `${i * 100}%` }}
                  aria-hidden={!active} onContextMenu={(e) => e.preventDefault()}>
                  {c.kind === "photo" && c.images?.length
                    ? <PhotoCarousel images={c.images} active={active} />
                    : c.src
                    ? <FeedVideo src={c.src} poster={c.poster} width={c.width} height={c.height} active={active} paused={!!paused[c.id] || !!fs} muted={muted} rate={rate}
                        preload={active ? "active" : i === index + 1 ? "next" : "idle"}
                        onTime={(t) => { const bar = trackRef.current?.querySelector<HTMLElement>(`.item[data-vid="${c.id}"] .progress i`); if (bar) bar.style.transform = `scaleX(${t})`; }} />
                    : <VideoBackdrop hue={c.hue} live={active && !paused[c.id] && !fs} />}
                  <div className="scrim" />
                  <div className="center-ind"><Icon name="play" size={30} filled /></div>
                  {bursts.filter((x) => x.id === c.id).map((x) => <span key={x.key} className="burst" style={{ left: x.x, top: x.y }}><Icon name="heart" size={96} filled /></span>)}
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
                      {c.kind === "photo"
                        ? (c.images?.length ? <button aria-label="全画面で見る" onClick={() => setPhotoFs({ images: c.images! })}><span className="hit"><Icon name="expand" size={26} /></span><span>全画面</span></button> : null)
                        : <button aria-label="全画面で見る" onClick={() => openFullscreen(c)}><span className="hit"><Icon name="expand" size={26} /></span><span>全画面</span></button>}
                      <button aria-label="その他" onClick={() => setSheet({ kind: "more", card: c })}><span className="hit"><Icon name="more" size={28} /></span></button>
                    </div>
                    <div className={`vinfo${expanded === c.id ? " open" : ""}`}>
                      <Link className="h" href={`/u/${encodeURIComponent(c.creator.handle)}`}>@{c.creator.handle}</Link>
                      <p>
                        {c.description || c.title}
                        {/* 長い説明は2行で切り、「もっと見る」で開く（TikTokと同じ） */}
                        {(c.description || c.title).length > 38 && (
                          <button className="vmore" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>{expanded === c.id ? "とじる" : "もっと見る"}</button>
                        )}
                      </p>
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
            {loadingMore && <div className="feed-end" style={{ top: `${cards.length * 100}%` }}><span className="spinner spin" /></div>}
          </div>
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
        <button className="r" onClick={goSearch} aria-label="検索"><Icon name="search" /></button>
        <input ref={searchFocus} className="kbd-proxy" aria-hidden="true" tabIndex={-1} inputMode="search" />
      </div>
      {sheet?.kind === "report" && <ReportSheet targetType="video" targetId={sheet.card.id} label={sheet.card.title} onClose={(hidden) => { setSheet(null); if (hidden) setCards((cs) => cs.filter((x) => x.id !== sheet.card.id)); }} />}
      {sheet?.kind === "comment" && <CommentSheet card={sheet.card} loggedIn={loggedIn} onClose={() => setSheet(null)} onPosted={() => patch(sheet.card.id, (x) => ({ comments: x.comments + 1 }))} />}
      {sheet?.kind === "share" && <ShareSheet card={sheet.card} onClose={() => setSheet(null)} />}
      {sheet?.kind === "more" && (
        <MoreSheet card={sheet.card} rate={rate} loggedIn={loggedIn} onClose={() => setSheet(null)} onShare={() => share(sheet.card)} onNotInterested={() => notInterested(sheet.card)}
          onHideCreator={() => block(sheet.card)} onReport={() => setSheet({ kind: "report", card: sheet.card })} onRate={changeRate} />
      )}
      {fs && <FullscreenView card={fs.card} startAt={fs.t} muted={muted} rate={rate} onClose={closeFullscreen} />}
      {photoFs && <PhotoFullscreen images={photoFs.images} onClose={() => setPhotoFs(null)} />}
    </div>
  );
}
