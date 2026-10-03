"use client";
import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { a2hsDismissed, isAndroid, isIOSSafari, isMobile, isStandalone, markInstalled, snoozeA2hs, type BIPEvent } from "./pwa";

/**
 * 「ホーム画面に追加」のおすすめ。
 * - すでに追加済み（全画面で開いている）なら出さない
 * - 開いてすぐは邪魔なので、少し見てもらってから下から出す
 * - Android/Chrome はボタン1つで追加。iPhone は Safari の共有ボタンからの手順を案内
 * - 「あとで」を押したら1週間は出さない
 */
const SHOW_AFTER_MS = 20_000;
/** 触らなければ自動で引っ込める（動画の邪魔をしない） */
const AUTO_HIDE_MS = 14_000;

export function AddToHome() {
  const [show, setShow] = useState(false);
  const [how, setHow] = useState(false);
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const bip = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    const installed = () => { markInstalled(); setShow(false); };
    window.addEventListener("beforeinstallprompt", bip);
    window.addEventListener("appinstalled", installed);
    // ?a2hs=1 ですぐ表示（見た目の確認用）
    const force = new URLSearchParams(location.search).get("a2hs") === "1";
    // ホーム画面に追加できる端末だけに出す（パソコンでは出さない）
    const canAdd = isIOSSafari() || isAndroid();
    const ok = !isStandalone() && (force || (isMobile() && canAdd && !a2hsDismissed()));
    const t = ok ? setTimeout(() => setShow(true), force ? 0 : SHOW_AFTER_MS) : null;
    return () => { window.removeEventListener("beforeinstallprompt", bip); window.removeEventListener("appinstalled", installed); if (t) clearTimeout(t); };
  }, []);

  const close = (snooze: boolean) => {
    if (snooze) snoozeA2hs();
    setLeaving(true);
    setTimeout(() => { setShow(false); setHow(false); }, 220);
  };

  // 出したあと、触られなければ自分から消える
  useEffect(() => {
    if (!show || how) return;
    const t = setTimeout(() => { snoozeA2hs(); setLeaving(true); setTimeout(() => setShow(false), 220); }, AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [show, how]);

  const add = async () => {
    if (!evt) { setHow(true); return; }
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") markInstalled();
    else snoozeA2hs();
    close(false);
  };

  if (!show) return null;
  return (
    <>
      {!how && (
        <div className={`a2hs${leaving ? " out" : ""}`} role="dialog" aria-label="ホーム画面に追加">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={40} height={40} />
          <div className="a2hs-b">
            <b>ホーム画面に追加</b>
            <span className="cap">アプリのように全画面ですぐ開けます</span>
          </div>
          <button className="btn btn-sm btn-primary" onClick={add}>追加</button>
          <button className="a2hs-x" onClick={() => close(true)} aria-label="閉じる"><Icon name="x" size={18} /></button>
        </div>
      )}
      {how && <HowToSheet onClose={() => close(true)} />}
    </>
  );
}

/** iPhone（Safari）向けの手順 */
function HowToSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="sheet-bg" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="ホーム画面に追加する手順">
        <span className="grab" />
        <div className="hd"><b style={{ fontSize: 20 }}>ホーム画面に追加</b><button className="iconbtn" style={{ marginRight: -8 }} onClick={onClose} aria-label="閉じる"><Icon name="x" size={22} /></button></div>
        <ol className="steps">
          <li><span className="n">1</span><span>画面の下にある<b> 共有ボタン</b>（四角から上向きの矢印）を押します<span className="ic"><Icon name="share" size={20} /></span></span></li>
          <li><span className="n">2</span><span>メニューを下にスクロールして<b>「ホーム画面に追加」</b>を選びます<span className="ic"><Icon name="plus" size={20} stroke={2.4} /></span></span></li>
          <li><span className="n">3</span><span>右上の<b>「追加」</b>を押すと完了です</span></li>
        </ol>
        <p className="cap" style={{ margin: 0 }}>アイコンの名前は「VYBE」になります。見られたくない場合は、追加のときに名前を変えられます。</p>
        <button className="btn btn-secondary pill" onClick={onClose}>閉じる</button>
      </div>
    </>
  );
}
