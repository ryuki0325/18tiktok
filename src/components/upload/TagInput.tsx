"use client";
import { useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";

/**
 * タグの入力。候補から選ぶだけでなく、自分で打って作れる。
 * 新しく作ったタグは動画には付くが、運営が見るまでは候補や検索には出ない。
 */
const MAX_LEN = 20;

export function TagInput({ all, value, max, onChange }: {
  all: string[]; value: string[]; max: number; onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const full = value.length >= max;

  const norm = (raw: string) => raw.normalize("NFKC").replace(/^[#＃]+/, "").replace(/[\s　]+/g, "").slice(0, MAX_LEN);

  const hits = useMemo(() => {
    const q = norm(text).toLowerCase();
    const pool = all.filter((t) => !value.includes(t));
    if (!q) return pool.slice(0, 12);
    return pool.filter((t) => t.toLowerCase().includes(q)).slice(0, 12);
  }, [text, all, value]);

  const add = (raw: string) => {
    const t = norm(raw);
    if (!t || full || value.includes(t)) { setText(""); return; }
    onChange([...value, t]);
    setText("");
    box.current?.focus();
  };

  const typed = norm(text);
  const isNew = typed.length > 0 && !all.some((t) => t.toLowerCase() === typed.toLowerCase()) && !value.includes(typed);

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
        placeholder={full ? `タグは${max}つまでです` : "タグを打つか、下から選ぶ"}
        aria-label="タグ" />

      <div className="chips">
        {isNew && !full && (
          <button type="button" className="chip new" onClick={() => add(text)}>
            <Icon name="plus" size={14} />「{typed}」を作る
          </button>
        )}
        {hits.map((t) => (
          <button type="button" key={t} className="chip" disabled={full} onClick={() => add(t)}>#{t}</button>
        ))}
      </div>
      <span className="cap">
        自分で作ったタグは、運営が見るまで「探す」には出ません（動画には付きます）。
      </span>
    </div>
  );
}
