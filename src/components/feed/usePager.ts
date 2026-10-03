"use client";
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * 縦スワイプのページャー（TikTok の操作感に寄せた自前実装）
 *
 * - 指に吸い付いて動く（ブラウザのスクロールではなく transform で動かすので 60fps を保ちやすい）
 * - 指を離した時の速さと距離で「次へ / 戻る / その場に戻る」を決める
 * - 1回のスワイプで動くのは必ず1本だけ（滑り止め。勢いよく弾いても何本も飛ばない）
 * - 端ではゴムのように伸びて戻る。先頭で下に引くと「引っ張って更新」
 * - アニメーション中に指を置くと、その位置でつかめる
 * - ホイール・トラックパッドは1回の操作で1本（慣性で連続して進まない）、キーボードの ↑↓ / J K
 * - タップ・ダブルタップ・長押し・左スワイプは呼び出し側に知らせる
 */
export type PagerHandlers = {
  onTap?: (x: number, y: number, index: number) => void;
  onLongPress?: (down: boolean) => void;
  onSwipeLeft?: (index: number) => void;
  onRefresh?: () => Promise<void>;
};

const STIFFNESS = 340;       // ばねの強さ（1/s²）
const DAMPING = 2 * Math.sqrt(STIFFNESS) * 0.95; // ほぼ臨界減衰：行き過ぎずに素早く止まる
const FLING_VELOCITY = 0.35; // px/ms：これより速く弾いたら距離が短くても次へ
const DISTANCE_RATIO = 0.18; // 画面の高さに対する割合：これ以上動かしたら次へ
const REFRESH_PULL = 80;     // px：これ以上引いて離したら更新
const LONG_PRESS_MS = 450;


export function usePager(count: number, handlers: PagerHandlers, opts: { disabled?: boolean; initial?: number } = {}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(opts.initial ?? 0);
  const [height, setHeight] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // 毎フレーム変わる値は ref に持ち、React の再描画を起こさない
  const s = useRef({
    index: opts.initial ?? 0, h: 0, pos: 0, vel: 0, target: 0, raf: 0,
    mode: "idle" as "idle" | "pending" | "v" | "h" | "long",
    startX: 0, startY: 0, startPos: 0, samples: [] as { y: number; t: number }[],
    longTimer: 0 as unknown as ReturnType<typeof setTimeout>, pointerId: -1,
    wheelAcc: 0, wheelLock: false, wheelTimer: 0 as unknown as ReturnType<typeof setTimeout>, refreshing: false,
  });
  const h = useRef(handlers);
  const countRef = useRef(count);
  useLayoutEffect(() => { h.current = handlers; countRef.current = count; });

  const paint = useCallback(() => {
    const st = s.current;
    if (trackRef.current) trackRef.current.style.transform = `translate3d(0, ${-st.pos}px, 0)`;
    if (pullRef.current) {
      const pull = Math.max(0, -st.pos);
      pullRef.current.style.opacity = String(Math.min(1, pull / REFRESH_PULL));
      pullRef.current.style.transform = `translate3d(-50%, ${Math.min(pull, REFRESH_PULL) - 40}px, 0) rotate(${pull * 3}deg)`;
    }
  }, []);

  const animateTo = useCallback((target: number, v0 = 0) => {
    const st = s.current;
    cancelAnimationFrame(st.raf);
    st.target = target;
    st.vel = Math.max(-4000, Math.min(4000, v0));
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const force = -STIFFNESS * (st.pos - st.target) - DAMPING * st.vel;
      st.vel += force * dt;
      st.pos += st.vel * dt;
      if (Math.abs(st.pos - st.target) < 0.4 && Math.abs(st.vel) < 8) {
        st.pos = st.target; st.vel = 0; paint();
        return;
      }
      paint();
      st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
  }, [paint]);

  const goTo = useCallback((i: number, v0 = 0) => {
    const st = s.current;
    const n = Math.max(0, Math.min(countRef.current - 1, i));
    st.index = n;
    animateTo(n * st.h, v0); // 先にアニメーションを始め、
    // 次の動画の準備（React の描画）は優先度を下げて、アニメーションのフレームを邪魔しないようにする
    startTransition(() => setIndex(n));
  }, [animateTo]);

  const step = useCallback((d: number) => goTo(s.current.index + d), [goTo]);

  // 画面の高さ（iPhone のアドレスバーの出入りで変わる）に追従
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const apply = () => {
      const st = s.current;
      const nh = el.clientHeight;
      if (!nh || nh === st.h) return;
      st.h = nh;
      setHeight(nh);
      cancelAnimationFrame(st.raf);
      st.pos = st.index * nh;
      paint();
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [paint]);

  // 件数が減って今の位置が範囲外になったら詰める
  useEffect(() => {
    if (count > 0 && s.current.index > count - 1) goTo(count - 1);
  }, [count, goTo]);

  const release = useCallback((vy: number) => {
    const st = s.current;
    const base = st.index * st.h;
    const moved = st.pos - base; // + は上に動かした（次へ）
    const last = countRef.current - 1;
    // 引っ張って更新
    if (st.index === 0 && moved < -REFRESH_PULL && h.current.onRefresh && !st.refreshing) {
      st.refreshing = true;
      setRefreshing(true);
      animateTo(-56, 0);
      void h.current.onRefresh().finally(() => {
        st.refreshing = false;
        setRefreshing(false);
        animateTo(0, 0);
      });
      return;
    }
    let dir = 0;
    if (moved > st.h * DISTANCE_RATIO || vy < -FLING_VELOCITY) dir = 1;
    else if (moved < -st.h * DISTANCE_RATIO || vy > FLING_VELOCITY) dir = -1;
    // 滑り止め：どれだけ速くても1本だけ
    const next = Math.max(0, Math.min(last, st.index + dir));
    goTo(next, -vy * 1000);
  }, [animateTo, goTo]);

  // ---- ポインター（指・マウス）----
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || opts.disabled) return;
    const st = s.current;
    const ignore = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("a,button,input,textarea,select,[data-no-swipe]");

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || ignore(e.target) || st.refreshing) return;
      cancelAnimationFrame(st.raf); // 動いている途中でもつかめる
      st.vel = 0;
      st.mode = "pending";
      st.pointerId = e.pointerId;
      st.startX = e.clientX; st.startY = e.clientY; st.startPos = st.pos;
      st.samples = [{ y: e.clientY, t: e.timeStamp }];
      clearTimeout(st.longTimer);
      st.longTimer = setTimeout(() => {
        if (st.mode === "pending") { st.mode = "long"; h.current.onLongPress?.(true); }
      }, LONG_PRESS_MS);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== st.pointerId || st.mode === "idle") return;
      const dx = e.clientX - st.startX, dy = e.clientY - st.startY;
      if (st.mode === "pending") {
        if (Math.abs(dy) > 7 && Math.abs(dy) > Math.abs(dx)) {
          st.mode = "v"; clearTimeout(st.longTimer);
          try { el.setPointerCapture(e.pointerId); } catch {}
        } else if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
          st.mode = "h"; clearTimeout(st.longTimer);
        } else return;
      }
      if (st.mode !== "v") return;
      e.preventDefault();
      st.samples.push({ y: e.clientY, t: e.timeStamp });
      if (st.samples.length > 8) st.samples.shift();
      let pos = st.startPos - dy;
      const max = (countRef.current - 1) * st.h;
      // 端ではゴムのように抵抗をつける
      if (pos < 0) pos = -rubberBand(-pos, st.h);
      else if (pos > max) pos = max + rubberBand(pos - max, st.h);
      // 1本より先には引っ張れない（滑り止め）
      const base = st.index * st.h;
      pos = Math.max(base - st.h, Math.min(base + st.h, pos));
      st.pos = pos;
      paint();
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== st.pointerId) return;
      clearTimeout(st.longTimer);
      const mode = st.mode;
      st.mode = "idle";
      st.pointerId = -1;
      if (mode === "v") {
        // 直近 100ms の速さ（px/ms、下向きが +）
        const now = e.timeStamp;
        const recent = st.samples.filter((p) => now - p.t < 100);
        const first = recent[0] ?? st.samples[0];
        const lastS = { y: e.clientY, t: now };
        const vy = first && lastS.t - first.t > 0 ? (lastS.y - first.y) / (lastS.t - first.t) : 0;
        release(vy);
      } else if (mode === "h") {
        if (e.clientX - st.startX < -60 && Math.abs(e.clientY - st.startY) < 60) h.current.onSwipeLeft?.(st.index);
      } else if (mode === "long") {
        h.current.onLongPress?.(false);
      } else if (mode === "pending" && e.type === "pointerup") {
        h.current.onTap?.(e.clientX, e.clientY, st.index);
      }
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [opts.disabled, paint, release]);

  // ---- ホイール・トラックパッド：1回の操作で1本。慣性の余韻が収まるまで次を受け付けない ----
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || opts.disabled) return;
    const st = s.current;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-no-swipe]")) return;
      e.preventDefault();
      clearTimeout(st.wheelTimer);
      st.wheelTimer = setTimeout(() => { st.wheelLock = false; st.wheelAcc = 0; }, 180);
      if (st.wheelLock) return;
      st.wheelAcc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      if (Math.abs(st.wheelAcc) > 40) {
        st.wheelLock = true;
        step(st.wheelAcc > 0 ? 1 : -1);
        st.wheelAcc = 0;
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [opts.disabled, step]);

  // ---- キーボード ----
  useEffect(() => {
    if (opts.disabled) return;
    const key = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "")) return;
      if (e.key === "ArrowDown" || e.key === "j" || e.key === "PageDown") { e.preventDefault(); step(1); }
      if (e.key === "ArrowUp" || e.key === "k" || e.key === "PageUp") { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [opts.disabled, step]);

  useEffect(() => () => cancelAnimationFrame(s.current.raf), []);

  return { viewportRef, trackRef, pullRef, index, height, refreshing, goTo, step };
}

/** 端のゴムの伸び（引くほど重くなる） */
function rubberBand(d: number, h: number) {
  return (h * 0.55 * d) / (h + d * 0.9);
}
