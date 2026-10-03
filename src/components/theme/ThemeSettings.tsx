"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { THEME_IDS, themeName, tokensFor, type ColorMode, type ThemePref } from "@/lib/theme";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { api } from "../feed/api";
import { MiniFeed } from "./MiniFeed";

function subscribeScheme(cb: () => void) {
  const m = window.matchMedia("(prefers-color-scheme: light)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export function ThemeSettings({ current }: { current: ThemePref }) {
  const [pend, setPend] = useState<ThemePref>(current);
  const sysLight = useSyncExternalStore(subscribeScheme, () => window.matchMedia("(prefers-color-scheme: light)").matches, () => false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const resolved = pend.mode === "system" ? (sysLight ? "light" : "dark") : pend.mode;
  const t = tokensFor(pend.id, resolved, pend.custom);
  const changed = JSON.stringify(pend) !== JSON.stringify(current);
  const apply = async () => {
    setBusy(true);
    const r = await api("/api/v1/me/preferences", { method: "PUT", body: pend });
    setBusy(false);
    if (!r.ok) { toast("保存できませんでした"); return; }
    toast("テーマを適用しました");
    router.refresh();
  };
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 4 }}>
          <MiniFeed tokens={t} id={pend.id} custom={pend.custom} />
          <p className="cap" style={{ margin: 0 }}>{changed ? "プレビュー：まだ適用されていません" : "適用中のテーマです"}</p>
        </div>
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className="label" style={{ padding: "0 16px", margin: 0 }}>テーマ</h2>
          <div className="tcards" role="radiogroup" aria-label="テーマ">
            {THEME_IDS.map((id) => {
              const tt = tokensFor(id, resolved, pend.custom);
              return (
                <button key={id} className="tcard" role="radio" aria-checked={pend.id === id}
                  onClick={() => setPend((p) => ({ ...p, id, mode: id === "minimal" && p.mode === "dark" && current.id !== "minimal" ? "light" : p.mode }))}>
                  <span className="sw2" style={{ background: tt.bg }}>
                    <span style={{ position: "absolute", left: 10, right: 10, top: 12, height: 34, borderRadius: 10, background: tt.surface }} />
                    <span style={{ position: "absolute", left: 10, top: 54, width: 40, height: 6, borderRadius: 4, background: tt.text, opacity: 0.8 }} />
                    <span style={{ position: "absolute", left: 10, top: 66, width: 58, height: 5, borderRadius: 4, background: tt.muted, opacity: 0.7 }} />
                    <span style={{ position: "absolute", left: 10, right: 10, bottom: 12, height: 20, borderRadius: 999, background: `linear-gradient(90deg, ${tt.fill}, ${tt.fill2})` }} />
                    {id === "custom" && <span style={{ position: "absolute", top: 12, left: 16, color: tt.text }}><Icon name="sliders" size={16} /></span>}
                    {pend.id === id && <span style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: "50%", background: "var(--fill)", color: "var(--on)", display: "grid", placeItems: "center" }}><Icon name="check" size={13} stroke={3} /></span>}
                  </span>
                  <span>{themeName(id)}</span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="sec" style={{ gap: 10 }}>
          <h2 className="label" style={{ margin: 0 }}>表示モード</h2>
          <div className="seg">
            {([["dark", "ダーク"], ["light", "ライト"], ["system", "システム"]] as [ColorMode, string][]).map(([k, l]) => (
              <button key={k} aria-pressed={pend.mode === k} disabled={pend.id === "custom"} onClick={() => setPend((p) => ({ ...p, mode: k }))}>{l}</button>
            ))}
          </div>
          {pend.id === "custom" && <span className="cap">Customは設定した背景色がそのまま使われます。</span>}
        </section>
        <section className="sec">
          <div className="list">
            <Link className="row" href="/settings/theme/custom"><span style={{ color: "var(--accent)" }}><Icon name="sliders" size={22} /></span><span className="grow">カスタマイズ<span className="cap" style={{ display: "block" }}>メイン・アクセント・背景・カード・文字の5色</span></span><span className="muted"><Icon name="chev" size={20} /></span></Link>
          </div>
        </section>
        <p className="cap" style={{ padding: "0 16px", margin: 0, lineHeight: 1.6 }}>レイアウト・ボタンの位置・アイコンの形はどのテーマでも同じです。動画の上の文字は読みやすさを保つため、常に白で表示されます。</p>
      </div>
      <div className="bottom-fixed"><button className="btn btn-primary" disabled={!changed || busy} onClick={apply}>{changed ? (busy ? "適用中…" : "このテーマを適用") : "適用中のテーマです"}</button></div>
    </>
  );
}
