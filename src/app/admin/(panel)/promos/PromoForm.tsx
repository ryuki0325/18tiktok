"use client";
import { useState } from "react";
import { promoAction } from "@/lib/admin-actions";
import { PromoMedia } from "./PromoMedia";

export type EditPromo = {
  id: string; kind: "affiliate" | "network" | "sponsor"; title: string; body: string;
  imageUrl: string | null; embedUrl: string | null; videoUrl: string | null; ctaText: string; targetUrl: string | null; html: string | null;
  label: string; category: string; weight: number;
};

/** 広告・アフィリ枠の追加／編集フォーム。種類で入力欄を出し分ける。editing を渡すと編集。 */
export function PromoForm({ editing, maxMb, maxSec }: { editing?: EditPromo; maxMb: number; maxSec: number }) {
  const [kind, setKind] = useState<"affiliate" | "sponsor" | "network">(editing?.kind ?? "affiliate");
  const isNet = kind === "network";
  const e = editing;
  return (
    <form action={promoAction} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 640, marginBottom: 24 }}>
      <input type="hidden" name="op" value={e ? "update" : "add"} />
      {e && <input type="hidden" name="id" value={e.id} />}
      <b>{e ? "枠を編集" : "枠を追加"}</b>

      {/* かんたん：ASPの広告コードを貼るだけで自動設定（DTI Cash 等のバナー<a><img>／HTML広告<iframe>に対応） */}
      <label className="label">広告コードを貼る（かんたん・任意）<small>DTI等のバナー／HTML広告コードをそのまま</small></label>
      <textarea className="input num" name="adCode" rows={3} placeholder={`例）<a href='https://clear-tv.com/Click/...'><img src='https://.../banner.jpg'></a>\nまたは <iframe src='https://...?affid=...' ...></iframe>`} style={{ resize: "vertical", minHeight: 56, fontFamily: "monospace", fontSize: 12 }} />
      <span className="cap">↑ ここに貼ると、画像リンクは「アフィリ送客」、iframeは「広告ネットワーク」に自動で振り分けます。遷移先・画像も自動。貼らない場合は下で手入力。</span>

      <label className="label">種類
        <select className="input" name="kind" value={kind} onChange={(ev) => setKind(ev.target.value as typeof kind)} style={{ height: 42 }}>
          <option value="affiliate">アフィリ送客（ライブチャット・出会い系・グッズ・VPN 等）</option>
          <option value="sponsor">スポンサー／PR</option>
          <option value="network">広告ネットワーク（コードを貼る）</option>
        </select>
      </label>

      {!isNet ? (
        <>
          <input className="input" name="title" placeholder="見出し（任意・例：ライブチャットで今すぐ話す）" maxLength={80} defaultValue={e?.title ?? ""} />
          <input className="input" name="body" placeholder="説明（任意・例：登録無料／国内最大級）" maxLength={200} defaultValue={e?.body ?? ""} />
          <input className="input num" name="targetUrl" type="url" inputMode="url" placeholder="遷移先 https://（あなたのアフィリリンク。広告コードを貼った場合は不要）" defaultValue={e?.targetUrl ?? ""} />
          <PromoMedia maxMb={maxMb} maxSec={maxSec} initial={{ imageUrl: e?.imageUrl ?? null, videoUrl: e?.videoUrl ?? null, embedUrl: e?.embedUrl ?? null }} />
          <input className="input" name="ctaText" placeholder="ボタン文言（既定：詳しく見る）" maxLength={24} defaultValue={e?.ctaText ?? ""} />
        </>
      ) : (
        <>
          <textarea className="input num" name="html" rows={6} placeholder="広告ネットワークのコード（<script> や <iframe>）。隔離された枠内で表示されます。" style={{ resize: "vertical" }} defaultValue={e?.html ?? ""} />
          <span className="cap">※ ExoClick / TrafficJunky / JuicyAds 等のコードをそのまま貼れます。安全のため隔離枠（sandbox iframe）で表示します。</span>
        </>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="label" style={{ flex: 1, minWidth: 140 }}>表記
          <input className="input" name="label" placeholder="PR" maxLength={12} defaultValue={e?.label ?? "PR"} />
        </label>
        <label className="label" style={{ flex: 1, minWidth: 140 }}>出す相手
          <select className="input" name="category" defaultValue={e?.category ?? "all"} style={{ height: 42 }}>
            <option value="all">全員</option>
            <option value="women">女性向けを見る人</option>
            <option value="men">男性向けを見る人</option>
            <option value="gay">ゲイ向けを見る人</option>
            <option value="lesbian">レズビアン向けを見る人</option>
          </select>
        </label>
        <label className="label" style={{ width: 120 }}>重み
          <input className="input num" name="weight" type="number" min={1} max={100} defaultValue={e?.weight ?? 1} />
        </label>
      </div>

      <button className="btn btn-primary" style={{ maxWidth: 200 }}>{e ? "保存する" : "追加する"}</button>
      {!e && <span className="cap">フィードに数本ごとに差し込まれます（重みの大きい枠ほど多く出ます）。</span>}
    </form>
  );
}
