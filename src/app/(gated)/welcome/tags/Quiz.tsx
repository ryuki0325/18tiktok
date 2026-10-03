"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/components/feed/api";
import { Icon } from "@/components/Icon";
import { VideoBackdrop } from "@/components/VideoBackdrop";
import { AUDIENCES, INTENSITIES, MOODS, SITUATIONS, attractionOptions, type Audience, type Intensity } from "@/lib/audience";

/**
 * はじめに：5つの質問で、見る動画を絞り込む
 * Q1 ジャンル（絞り込み）→ Q2 気分 → Q3 シチュエーション → Q4 惹かれるもの（Q2〜4はおすすめの重み付け）→ Q5 刺激の強さ（上限として絞り込み）
 */
const STEPS = 5;

function Q({ n, kicker, title, lead }: { n: number; kicker: string; title: React.ReactNode; lead: string }) {
  return (
    <>
      <span className="onb-kicker">Q{n} ／ {kicker}</span>
      <h2 className="onb-title">{title}</h2>
      <p className="muted" style={{ margin: "0 0 14px", fontSize: 14 }}>{lead}</p>
    </>
  );
}

export function Quiz({ initialAudience, initialTags, initialIntensity }: { initialAudience: Audience; initialTags: string[]; initialIntensity: number }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [aud, setAud] = useState<Audience | null>(initialTags.length ? initialAudience : null);
  const [mood, setMood] = useState<string | null>(MOODS.find((m) => m.tags.every((t) => initialTags.includes(t)))?.id ?? null);
  const [situ, setSitu] = useState<string[]>(SITUATIONS.filter((s) => initialTags.includes(s.id)).map((s) => s.id));
  const [attr, setAttr] = useState<string[]>(initialTags);
  const [level, setLevel] = useState<Intensity | null>(initialTags.length ? (initialIntensity as Intensity) : null);
  const [busy, setBusy] = useState(false);
  const attrOpts = useMemo(() => attractionOptions(aud ?? "all"), [aud]);

  const save = async (lv: Intensity | null) => {
    setBusy(true);
    const tags = [...new Set([...(MOODS.find((m) => m.id === mood)?.tags ?? []), ...situ, ...attr.filter((a) => attrOpts.some((o) => o.id === a))])];
    await api("/api/v1/me/tags", { method: "PUT", body: { tags, audience: aud ?? "all", maxIntensity: lv ?? 3 } });
    router.replace("/");
    router.refresh();
  };
  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const pickAndNext = (fn: () => void) => { fn(); try { navigator.vibrate?.(8); } catch {} setTimeout(next, 200); };
  const toggle = (list: string[], set: (v: string[]) => void, id: string, max = 6) => set(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list);

  return (
    <div className="screen onb">
      <div className="onb-glow" aria-hidden="true" />
      <div className="navbar" style={{ background: "var(--bg)" }}>
        {step > 0 ? <button className="iconbtn" onClick={() => setStep(step - 1)} aria-label="戻る"><Icon name="back" /></button> : <span className="sp44" />}
        <h1 style={{ display: "flex", justifyContent: "center", gap: 5 }} aria-label={`質問 ${step + 1} / ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => <span key={i} className="onb-dot" data-on={i <= step} style={{ width: 16 }} />)}
        </h1>
        <button className="iconbtn muted" style={{ width: "auto", padding: "0 8px", fontSize: 15 }} disabled={busy} onClick={() => save(level)}>スキップ</button>
      </div>

      <div className="sec" style={{ gap: 6, flex: 1, position: "relative", paddingBottom: 16 }} key={step}>
        {step === 0 && (
          <>
            <Q n={1} kicker="18+ ONLY" title={<>どんな動画を<br />見たいですか？</>} lead="選んだジャンルの動画だけが、おすすめに並びます。" />
            <div className="onb-grid" role="radiogroup" aria-label="見たいジャンル">
              {AUDIENCES.map((a) => (
                <button key={a.id} role="radio" aria-checked={aud === a.id} className="onb-card" onClick={() => pickAndNext(() => setAud(a.id))}>
                  <VideoBackdrop hue={a.hue as unknown as [number, number, number]} live={aud === a.id} />
                  <span className="onb-card-scrim" />
                  <span className="onb-card-body"><b>{a.label}</b><span>{a.desc}</span></span>
                  <span className="onb-check"><Icon name="check" size={14} stroke={3} /></span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Q n={2} kicker="MOOD" title={<>今夜の気分は？</>} lead="いちばん近いものを1つ選んでください。" />
            <div className="onb-grid" role="radiogroup" aria-label="今夜の気分">
              {MOODS.map((m) => (
                <button key={m.id} role="radio" aria-checked={mood === m.id} className="onb-card" onClick={() => pickAndNext(() => setMood(m.id))}>
                  <VideoBackdrop hue={m.hue!} live={mood === m.id} />
                  <span className="onb-card-scrim" />
                  <span className="onb-card-body"><b style={{ fontSize: 19 }}>{m.label}</b><span>{m.desc}</span></span>
                  <span className="onb-check"><Icon name="check" size={14} stroke={3} /></span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Q n={3} kicker="SITUATION" title={<>好きな<br />シチュエーションは？</>} lead="いくつでも選べます。" />
            <div className="onb-chips">
              {SITUATIONS.map((s) => <button key={s.id} className="onb-chip" aria-pressed={situ.includes(s.id)} onClick={() => toggle(situ, setSitu, s.id)}>{s.label}</button>)}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Q n={4} kicker="TYPE" title={<>惹かれるのは？</>} lead="いくつでも選べます。好みに近い動画が先に届きます。" />
            <div className="onb-chips">
              {attrOpts.map((o) => <button key={o.id} className="onb-chip" aria-pressed={attr.includes(o.id)} onClick={() => toggle(attr, setAttr, o.id)}>{o.label}</button>)}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <Q n={5} kicker="LEVEL" title={<>刺激の強さは<br />どこまで？</>} lead="選んだ強さまでの動画だけが表示されます。あとから設定で変えられます。" />
            <div role="radiogroup" aria-label="刺激の強さ" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {INTENSITIES.map((x) => (
                <button key={x.level} role="radio" aria-checked={level === x.level} className="onb-level" disabled={busy}
                  onClick={() => { setLevel(x.level); try { navigator.vibrate?.(8); } catch {} setTimeout(() => void save(x.level), 220); }}>
                  <span className="onb-meter" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} data-on={i <= x.level} />)}</span>
                  <span style={{ flex: 1, textAlign: "left" }}><b style={{ display: "block", fontSize: 18 }}>{x.label}</b><span className="cap">{x.desc}</span></span>
                  <span className="onb-check" style={{ position: "static" }}><Icon name="check" size={14} stroke={3} /></span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {(step === 2 || step === 3) && (
        <div className="bottom-fixed" style={{ background: "linear-gradient(180deg, transparent, var(--bg) 30%)", borderTop: 0 }}>
          <button className="cta" onClick={next}>
            {(step === 2 ? situ : attr).length ? <>次へ（{(step === 2 ? situ : attr).length}つ選択中） <Icon name="arrowR" size={20} stroke={2.2} /></> : <>選ばずに次へ <Icon name="arrowR" size={20} stroke={2.2} /></>}
          </button>
        </div>
      )}
      {busy && <div className="onb-busy" role="status"><span className="spinner spin" />あなた好みの動画を集めています…</div>}
    </div>
  );
}
