"use client";
import { useActionState, useState } from "react";
import { updateVideoAction } from "@/lib/creator-actions";
import { Field, FormMessage } from "@/components/forms/Field";
import { INTENSITIES } from "@/lib/audience";

export function EditForm(p: { id: string; title: string; description: string; link: string; tags: string[]; selected: string[]; published: boolean; intensity: number }) {
  const [state, action, pending] = useActionState(updateVideoAction, undefined);
  const [sel, setSel] = useState<string[]>(p.selected);
  const [lv, setLv] = useState<number | null>(p.intensity);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <input type="hidden" name="id" value={p.id} />
      <div className="sec" style={{ gap: 18, paddingBottom: 16 }}>
        <Field label="タイトル" hint="60文字まで" htmlFor="title"><input className="input" id="title" name="title" defaultValue={p.title} maxLength={60} required /></Field>
        <Field label="説明" hint="300文字まで" htmlFor="description"><textarea className="input" id="description" name="description" defaultValue={p.description} maxLength={300} /></Field>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">タグ<small>最大5つ（{sel.length}/5）</small></span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {p.tags.map((t) => <button type="button" key={t} className="chip" aria-pressed={sel.includes(t)} onClick={() => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : s.length < 5 ? [...s, t] : s))}>#{t}</button>)}
          </div>
          {sel.map((t) => <input key={t} type="hidden" name="tags" value={t} />)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">刺激の強さ<small>強くすると再審査になります</small></span>
          <div className="seg" role="radiogroup" aria-label="刺激の強さ">
            {INTENSITIES.map((x) => <button type="button" key={x.level} role="radio" aria-checked={lv === x.level} onClick={() => setLv(x.level)}>{x.label}</button>)}
          </div>
          {lv && <span className="cap">{INTENSITIES.find((x) => x.level === lv)?.desc}。実際の内容より弱く選ぶと差し戻しの対象になります。</span>}
          {lv && <input type="hidden" name="intensity" value={lv} />}
        </div>
        <Field label="外部リンク" hint="空にすると削除" htmlFor="link">
          <input className="input" id="link" name="link" type="url" defaultValue={p.link} placeholder="https://" />
          {p.published && <span className="cap">リンクを変えると、公開を一時止めて運営が再審査します。</span>}
        </Field>
        <FormMessage state={state} />
      </div>
      <div className="bottom-fixed"><button className="btn btn-primary" disabled={pending || sel.length === 0}>{pending ? "保存中…" : "保存する"}</button></div>
    </form>
  );
}
