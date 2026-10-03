"use client";

/** ホーム画面から開いた状態（アプリのように全画面）か */
export const isStandalone = () => {
  try {
    return window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: fullscreen)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch { return false; }
};

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
/** iPhone で「ホーム画面に追加」ができるのは Safari だけ（Chrome/Firefox などの別ブラウザではメニューに出ない） */
export const isIOSSafari = () => isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS|Line\//.test(navigator.userAgent);
export const isAndroid = () => /Android/.test(navigator.userAgent);
export const isMobile = () => isIOS() || isAndroid();

/** Android/Chrome がくれる「インストールしますか」のイベント */
export type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KEY = "vybe.a2hs";
type Memo = { hidden?: number; installed?: boolean };
const read = (): Memo => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const write = (m: Memo) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...m })); } catch {} };

/** 「あとで」を押してから案内を出さない期間 */
const SNOOZE_MS = 7 * 86400_000;

export const a2hsDismissed = () => { const m = read(); return !!m.installed || (!!m.hidden && Date.now() - m.hidden < SNOOZE_MS); };
export const snoozeA2hs = () => write({ hidden: Date.now() });
export const markInstalled = () => write({ installed: true });
