"use client";
import { useActionState, useState } from "react";
import { createVideoAction } from "@/lib/creator-actions";
import { Check, Field, FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";

export function PostForm({ tags, domains }: { tags: string[]; domains: { domain: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createVideoAction, undefined);
  const [sel, setSel] = useState<string[]>([]);
  const [checks, setChecks] = useState({ c1: false, c2: false, c3: false });
  const [title, setTitle] = useState("");
  const ready = title.trim() && sel.length > 0 && checks.c1 && checks.c2 && checks.c3;
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="sec" style={{ gap: 18, paddingBottom: 16 }}>
        <div className="card" style={{ padding: "22px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", border: "1.5px dashed color-mix(in srgb, var(--text) 22%, transparent)" }}>
          <span style={{ width: 52, height: 52, borderRadius: 16, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}><Icon name="video" size={28} /></span>
          <b>動画ファイルのアップロードは準備中です</b>
          <span className="cap">今はタイトル・タグ・リンク・同意だけを先に登録できます。審査と公開の流れはそのまま使えます（動画は抽象的なプレースホルダーで表示されます）。</span>
        </div>
        <Field label="タイトル" hint="必須・60文字まで" htmlFor="title"><input className="input" id="title" name="title" maxLength={60} placeholder="例）最高の時間でした…" value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
        <Field label="説明" hint="300文字まで" htmlFor="description"><textarea className="input" id="description" name="description" maxLength={300} placeholder="動画の雰囲気を短く" /></Field>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">タグ<small>必須・最大5つ（{sel.length}/5）</small></span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tags.map((t) => (
              <button type="button" key={t} className="chip" aria-pressed={sel.includes(t)} onClick={() => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : s.length < 5 ? [...s, t] : s))}>#{t}</button>
            ))}
          </div>
          {sel.map((t) => <input key={t} type="hidden" name="tags" value={t} />)}
        </div>
        <Field label="外部リンク" hint="任意" htmlFor="link">
          <input className="input" id="link" name="link" type="url" inputMode="url" placeholder="https://" />
          <span className="cap" style={{ display: "flex", gap: 6 }}><Icon name="shield" size={14} />運営が許可した提携先のURLのみ表示されます。許可先：{domains.map((d) => d.domain).join("、") || "なし"}。それ以外のドメインは審査が通るまで表示されません。短縮URLは使えません。</span>
        </Field>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="label" style={{ marginBottom: 4 }}>確認事項<small>すべて必須</small></span>
          {(["c1", "c2", "c3"] as const).map((k, i) => (
            <span key={k} onChange={(e) => setChecks((c) => ({ ...c, [k]: (e.target as HTMLInputElement).checked }))}>
              <Check name={k} required>{["自分が撮影・出演し、権利を持つ動画です", "出演者全員が18歳以上で、公開に同意しています", "他人の動画の転載・切り抜きではありません"][i]}</Check>
            </span>
          ))}
          <span className="cap" style={{ marginTop: 4 }}>同意の内容は日時とともに、変更できない記録として保存されます。</span>
        </div>
        <FormMessage state={state} />
      </div>
      <div className="bottom-fixed"><button className="btn btn-primary" disabled={!ready || pending}>{pending ? "送信中…" : "審査に提出"}</button></div>
    </form>
  );
}
