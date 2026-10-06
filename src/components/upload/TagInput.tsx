"use client";
import { useRef, useState } from "react";
import { Icon } from "../Icon";

/**
 * タグの入力。自分で自由に打って作れる。
 * 作ったタグはすぐに「探す」にも反映される（危ない言葉だけは弾く）。
 */
const MAX_LEN = 20;

export function TagInput({ value, max, onChange }: {
  value: string[]; max: number; onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const full = value.length >= max;

  const norm = (raw: string) => raw.normalize("NFKC").replace(/^[#＃]+/, "").replace(/[\s　]+/g, "").slice(0, MAX_LEN);

  const add = (raw: string) => {
    const t = norm(raw);
    if (!t || full || value.includes(t)) { setText(""); return; }
    onChange([...value, t]);
    setText("");
    box.current?.focus();
  };

  const typed = norm(text);
  const isNew = typed.length > 0 && !value.includes(typed);

  return (
    <div className="taginput">
      {value.length > 0 && (
        <div className="chips">
          {value.map((t) => (
            <span key={t} className="chip on">
              #{t}
              <button type="button" aria-label={`${t} を外す`} onClick={() => onChange(value.filter((x) => x !== t))}>
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      <input ref={box} className="input" value={text} disabled={full}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(text); }
          else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        maxLength={MAX_LEN + 1}
        placeholder={full ? `タグは${max}つまでです` : "タグを打って Enter で追加"}
        aria-label="タグ" />

      {isNew && !full && (
        <div className="chips">
          <button type="button" className="chip new" onClick={() => add(text)}>
            <Icon name="plus" size={14} />「{typed}」を追加
          </button>
        </div>
      )}
      <span className="cap">自由にタグを付けられます。付けたタグはすぐ「探す」に反映されます。</span>
    </div>
  );
}
