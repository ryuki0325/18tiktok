"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { updateVideoAction } from "@/lib/creator-actions";
import { Field, FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";

export function EditForm(p: {
  id: string; title: string; description: string;
  visibility: "public" | "private"; comments: boolean;
  kind: "video" | "photo"; embedUrl: string | null; embedFit: "cover" | "contain"; linkUrl: string;
}) {
  const [state, action, pending] = useActionState(updateVideoAction, undefined);
  const [caption, setCaption] = useState(p.description || p.title);
  const [visibility, setVisibility] = useState<"public" | "private">(p.visibility);
  const [comments, setComments] = useState(p.comments);
  const [embedFit, setEmbedFit] = useState<"cover" | "contain">(p.embedFit);
  const tags = Array.from(new Set((caption.match(/#([^\s#、。,.!?！？]+)/g) ?? []).map((t) => t.slice(1)).filter(Boolean))).slice(0, 5);

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="title" value={caption.split("\n")[0].slice(0, 60)} />
      <input type="hidden" name="description" value={caption.slice(0, 300)} />
      <input type="hidden" name="visibility" value={visibility} />
      <input type="hidden" name="commentsEnabled" value={comments ? "on" : "off"} />
      <input type="hidden" name="embedFit" value={embedFit} />
      <div className="sec" style={{ gap: 18, paddingBottom: 16 }}>
        <Field label="説明" hint="300文字まで。#タグ をつけると探すに反映" htmlFor="caption">
          <textarea className="input" id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} rows={5}
            placeholder="説明を書く…　#タグ をつけると見つけてもらいやすくなります" />
        </Field>
        <span className="cap num">{caption.length}/300{tags.length > 0 && `・タグ：${tags.map((t) => `#${t}`).join(" ")}`}</span>

        {/* 公開範囲 */}
        <div className="opt-list">
          <div className="opt">
            <Icon name="eye" size={20} />
            <span className="grow">この投稿を見られる人</span>
            <div className="seg mini" role="radiogroup" aria-label="この投稿を見られる人">
              <button type="button" role="radio" aria-checked={visibility === "public"} onClick={() => setVisibility("public")}>全員</button>
              <button type="button" role="radio" aria-checked={visibility === "private"} onClick={() => setVisibility("private")}>自分だけ</button>
            </div>
          </div>
          <button type="button" className="opt" onClick={() => setComments((v) => !v)} aria-pressed={comments}>
            <Icon name="msg" size={20} />
            <span className="grow" style={{ textAlign: "left" }}>コメントを許可</span>
            <span className={`sw${comments ? " on" : ""}`} aria-hidden="true"><i /></span>
          </button>
        </div>

        {/* 動画の向き（埋め込み動画のみ） */}
        {p.kind === "video" && p.embedUrl && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label">動画の向き</span>
            <div className="seg" role="radiogroup" aria-label="動画の向き">
              <button type="button" role="radio" aria-checked={embedFit === "cover"} onClick={() => setEmbedFit("cover")}>縦長（全画面）</button>
              <button type="button" role="radio" aria-checked={embedFit === "contain"} onClick={() => setEmbedFit("contain")}>横長（全体表示）</button>
            </div>
            <span className="cap">横長の動画は「横長（全体表示）」にすると左右が切れずきれいに出ます。</span>
          </div>
        )}

        {/* 変更できないもの（埋め込み動画・完全版リンク） */}
        <div className="notice info" role="note" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <b style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}><Icon name="lock" size={16} />ここは変更できません</b>
          {p.kind === "photo"
            ? <span className="cap">写真そのもの（枚数・画像）は編集できません。</span>
            : <span className="cap" style={{ wordBreak: "break-all" }}>埋め込み動画：{p.embedUrl || "（なし）"}</span>}
          <span className="cap" style={{ wordBreak: "break-all" }}>完全版リンク（アフィリエイトURL）：{p.linkUrl || "（なし）"}</span>
          <span className="cap">動画や完全版リンクを変えたいときは、<Link href="/creator/new" style={{ color: "var(--accent)", textDecoration: "underline" }}>新しく投稿し直して</Link>ください。</span>
        </div>

        <FormMessage state={state} />
      </div>
      <div className="bottom-fixed"><button className="btn btn-primary" disabled={pending || caption.trim().length === 0}>{pending ? "保存中…" : "保存する"}</button></div>
    </form>
  );
}
