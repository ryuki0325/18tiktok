"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/feed/api";
import { Icon } from "@/components/Icon";
import { VideoBackdrop } from "@/components/VideoBackdrop";
import { AUDIENCES, TAG_GROUPS, type Audience } from "@/lib/audience";

const MIN = 3;

/** はじめに：①見たいジャンル（最初の分岐）→ ②好みのタグ */
export function TagPicker({ initialTags, initialAudience }: { initialTags: string[]; initialAudience: Audience }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [aud, setAud] = useState<Audience | null>(initialAudience === "all" && initialTags.length === 0 ? null : initialAudience);
  const [sel, setSel] = useState<string[]>(initialTags);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const save = async (audience: Audience, tags: string[]) => {
    setBusy(true);
    await api("/api/v1/me/tags", { method: "PUT", body: { tags, audience } });
    router.replace("/");
    router.refresh();
  };
  const toggle = (t: string) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : s.length < 10 ? [...s, t] : s));

  return (
    <div className="screen onb">
      <div className="onb-glow" aria-hidden="true" />
      <div className="navbar" style={{ background: "transparent", backdropFilter: "none" }}>
        {step === 2 ? <button className="iconbtn" onClick={() => setStep(1)} aria-label="戻る"><Icon name="back" /></button> : <span className="sp44" />}
        <h1 style={{ display: "flex", justifyContent: "center", gap: 6 }} aria-label={`ステップ ${step} / 2`}>
          {[1, 2].map((n) => <span key={n} className="onb-dot" data-on={n <= step} />)}
        </h1>
        <button className="iconbtn muted" style={{ width: "auto", padding: "0 8px", fontSize: 15 }} disabled={busy} onClick={() => save(aud ?? "all", step === 2 ? sel : [])}>スキップ</button>
      </div>

      {step === 1 ? (
        <div className="sec" style={{ gap: 6, flex: 1, position: "relative" }}>
          <span className="onb-kicker">18+ ONLY</span>
          <h2 className="onb-title">どんな動画を<br />見たいですか？</h2>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: 14 }}>選んだジャンルの動画が、おすすめに並びます。あとから設定で変えられます。</p>
          <div className="onb-grid" role="radiogroup" aria-label="見たいジャンル">
            {AUDIENCES.map((a) => (
              <button key={a.id} role="radio" aria-checked={aud === a.id} className="onb-card" onClick={() => { setAud(a.id); setTimeout(() => setStep(2), 220); }}>
                <VideoBackdrop hue={a.hue as unknown as [number, number, number]} live={aud === a.id} />
                <span className="onb-card-scrim" />
                <span className="onb-card-body">
                  <b>{a.label}</b>
                  <span>{a.desc}</span>
                </span>
                <span className="onb-check"><Icon name="check" size={14} stroke={3} /></span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="sec" style={{ gap: 6, flex: 1, position: "relative", paddingBottom: 16 }}>
            <span className="onb-kicker">{AUDIENCES.find((a) => a.id === aud)?.label ?? "すべて"}</span>
            <h2 className="onb-title">好みを<br />教えてください</h2>
            <p className="muted" style={{ margin: "0 0 10px", fontSize: 14 }}>{MIN}つ以上選ぶと、あなた好みの動画が先に届きます。</p>
            {TAG_GROUPS.map((g) => (
              <section key={g.title} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                <h3 className="onb-group">{g.title}</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {g.tags.map((t) => <button key={t} className="onb-chip" aria-pressed={sel.includes(t)} onClick={() => toggle(t)}>{t}</button>)}
                </div>
              </section>
            ))}
          </div>
          <div className="bottom-fixed" style={{ background: "linear-gradient(180deg, transparent, var(--bg) 30%)", borderTop: 0 }}>
            <button className="cta" disabled={sel.length < MIN || busy} style={sel.length < MIN ? { opacity: 0.4, boxShadow: "none" } : undefined} onClick={() => save(aud ?? "all", sel)}>
              {busy ? "準備中…" : sel.length < MIN ? `あと${MIN - sel.length}つ選んでください` : <>はじめる <Icon name="arrowR" size={20} stroke={2.2} /></>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
