"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { autoFix, contrastWarnings, CUSTOM_DEFAULT, customTokens, isHex, type CustomColors, type ThemePref } from "@/lib/theme";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { api } from "../feed/api";
import { MiniFeed } from "./MiniFeed";

const FIELDS: [keyof CustomColors, string, string][] = [
  ["accent2", "メインカラー", "グラデーション・強調"], ["accent", "アクセントカラー", "選択状態・ボタン"],
  ["bg", "背景", "画面の地"], ["surface", "カード", "シート・入力欄"], ["text", "文字", "本文・見出し"],
];

export function CustomTheme({ current }: { current: ThemePref }) {
  const [c, setC] = useState<CustomColors>(current.custom);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const warns = contrastWarnings(c);
  const set = (k: keyof CustomColors, v: string) => {
    const val = (v.startsWith("#") ? v : "#" + v).toUpperCase();
    setDraft((d) => ({ ...d, [k]: val }));
    if (isHex(val)) setC((x) => ({ ...x, [k]: val }));
  };
  const save = async () => {
    setBusy(true);
    const r = await api("/api/v1/me/preferences", { method: "PUT", body: { id: "custom", mode: current.mode, custom: c } });
    setBusy(false);
    if (!r.ok) { toast("保存できませんでした"); return; }
    toast("カスタムテーマを保存して適用しました");
    router.push("/settings/theme");
    router.refresh();
  };
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 16 }}>
        <div style={{ position: "sticky", top: 52, zIndex: 5, background: "var(--bg)", display: "flex", justifyContent: "center", padding: "4px 0 10px" }}>
          <MiniFeed tokens={customTokens(c)} id="custom" custom={c} scale={0.3} hue={[205, 230, 180]} />
        </div>
        <div className="sec">
          <div className="list">
            {FIELDS.map(([k, l, d]) => (
              <div key={k} className="cf">
                <label className="sq" style={{ background: c[k] }}><input type="color" value={c[k].toLowerCase()} onChange={(e) => set(k, e.target.value)} aria-label={`${l}を選ぶ`} /></label>
                <span className="grow"><b style={{ display: "block", fontSize: 15 }}>{l}</b><span className="cap">{d}</span></span>
                <input className="hex" value={draft[k] ?? c[k]} maxLength={7} onChange={(e) => set(k, e.target.value)} onBlur={() => setDraft((x) => ({ ...x, [k]: c[k] }))} aria-label={`${l}のカラーコード`} />
              </div>
            ))}
          </div>
        </div>
        {warns.length > 0 && (
          <div className="sec">
            <div className="notice warn" role="status">
              <Icon name="alert" size={18} />
              <div style={{ flex: 1 }}>{warns.map((w) => <div key={w}>{w}</div>)}
                <button style={{ marginTop: 8, fontWeight: 700, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3 }} onClick={() => { setC(autoFix(c)); setDraft({}); toast("読みやすい配色に補正しました"); }}>自動で補正する</button>
              </div>
            </div>
          </div>
        )}
        <p className="cap" style={{ padding: "0 16px", margin: 0 }}>サブ背景・補助文字・ボタン上の文字色は、選んだ色から自動で作られます。</p>
      </div>
      <div className="bottom-fixed">
        <button className="btn btn-secondary" style={{ width: "34%" }} onClick={() => { setC(CUSTOM_DEFAULT); setDraft({}); }}><Icon name="reset" size={18} />リセット</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={save}>{busy ? "保存中…" : "保存して適用"}</button>
      </div>
    </>
  );
}
