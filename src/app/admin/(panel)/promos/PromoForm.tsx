"use client";
import { useState } from "react";
import { promoAction } from "@/lib/admin-actions";

/** 広告・アフィリ枠の追加フォーム。種類で入力欄を出し分ける。 */
export function PromoForm() {
  const [kind, setKind] = useState<"affiliate" | "sponsor" | "network">("affiliate");
  const isNet = kind === "network";
  return (
    <form action={promoAction} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 640, marginBottom: 24 }}>
      <input type="hidden" name="op" value="add" />
      <b>枠を追加</b>
      <label className="label">種類
        <select className="input" name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={{ height: 42 }}>
          <option value="affiliate">アフィリ送客（ライブチャット・出会い系・グッズ・VPN 等）</option>
          <option value="sponsor">スポンサー／PR</option>
          <option value="network">広告ネットワーク（コードを貼る）</option>
        </select>
      </label>

      {!isNet ? (
        <>
          <input className="input" name="title" placeholder="見出し（例：ライブチャットで今すぐ話す）" maxLength={80} required />
          <input className="input" name="body" placeholder="説明（任意・例：登録無料／国内最大級）" maxLength={200} />
          <input className="input num" name="targetUrl" type="url" inputMode="url" placeholder="遷移先 https://（あなたのアフィリリンク）" required />
          <input className="input num" name="imageUrl" type="url" inputMode="url" placeholder="画像URL https://（任意・16:9か縦型）" />
          <input className="input" name="ctaText" placeholder="ボタン文言（既定：詳しく見る）" maxLength={24} />
        </>
      ) : (
        <>
          <textarea className="input num" name="html" rows={6} placeholder="広告ネットワークのコード（<script> や <iframe>）。隔離された枠内で表示されます。" style={{ resize: "vertical" }} />
          <span className="cap">※ ExoClick / TrafficJunky / JuicyAds 等のコードをそのまま貼れます。安全のため隔離枠（sandbox iframe）で表示します。</span>
        </>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="label" style={{ flex: 1, minWidth: 140 }}>表記
          <input className="input" name="label" placeholder="PR" maxLength={12} defaultValue="PR" />
        </label>
        <label className="label" style={{ flex: 1, minWidth: 140 }}>出す相手
          <select className="input" name="category" style={{ height: 42 }}>
            <option value="all">全員</option>
            <option value="women">女性向けを見る人</option>
            <option value="men">男性向けを見る人</option>
            <option value="gay">ゲイ向けを見る人</option>
            <option value="lesbian">レズビアン向けを見る人</option>
          </select>
        </label>
        <label className="label" style={{ width: 120 }}>重み
          <input className="input num" name="weight" type="number" min={1} max={100} defaultValue={1} />
        </label>
      </div>

      <button className="btn btn-primary" style={{ maxWidth: 200 }}>追加する</button>
      <span className="cap">フィードに約6件ごとに差し込まれます（重みの大きい枠ほど多く出ます）。</span>
    </form>
  );
}
