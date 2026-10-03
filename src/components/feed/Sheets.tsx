"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { VideoCard } from "@/lib/content";
import { Icon } from "../Icon";
import { Avatar } from "../VideoBackdrop";
import { ago, fmt } from "../format";
import { useToast } from "../Toast";
import { api } from "./api";

function Sheet({ title, onClose, children, sub }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; sub?: React.ReactNode }) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  // つまみ（上部）を下にスワイプして閉じる
  const down = (e: React.PointerEvent) => { if ((e.target as HTMLElement).closest("button")) return; start.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (start.current !== null) setDy(Math.max(0, e.clientY - start.current)); };
  const up = () => { if (start.current === null) return; start.current = null; if (dy > 90) onClose(); else setDy(0); };
  return (
    <>
      <div className="sheet-bg" onClick={onClose} style={{ opacity: Math.max(0.2, 1 - dy / 300) }} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        style={dy ? { transform: `translate(-50%, ${dy}px)`, transition: "none" } : undefined}>
        <div className="drag" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="grab" />
          <div className="hd"><b style={{ fontSize: 20 }}>{title}</b><button className="iconbtn" style={{ marginRight: -8 }} onClick={onClose} aria-label="閉じる"><Icon name="x" size={22} /></button></div>
        </div>
        {sub}
        {children}
      </div>
    </>
  );
}

const REASONS = [
  ["minor_suspected", "未成年の疑い", true],
  ["non_consensual", "同意のない撮影・盗撮", true],
  ["unauthorized_repost", "無断転載", false],
  ["inappropriate", "不適切なコンテンツ", false],
  ["other", "その他", false],
] as const;

export function ReportSheet({ card, onClose }: { card: VideoCard; onClose: (hidden?: boolean) => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const canSend = !!reason && (reason !== "other" || detail.trim().length > 0) && !busy;
  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    const r = await api<{ hidden: boolean; duplicate: boolean }>(`/api/v1/videos/${card.id}/reports`, { method: "POST", body: { reason, detail } });
    setBusy(false);
    if (!r.ok) { toast(r.data.error?.message ?? "送信できませんでした"); return; }
    toast(r.data.duplicate ? "この動画はすでに通報済みです" : r.data.hidden ? "通報を受け付けました。運営が確認するまで、この動画は非公開になります。" : "通報を受け付けました。ご協力ありがとうございます。");
    onClose(r.data.hidden);
  };
  return (
    <Sheet title="通報する" onClose={() => onClose()} sub={<p className="muted" style={{ margin: "-6px 0 0", fontSize: 14 }}>問題のあるコンテンツを報告してください。</p>}>
      <div role="radiogroup" aria-label="通報の理由">
        {REASONS.map(([k, l, immediate]) => (
          <button key={k} className="radio" role="radio" aria-checked={reason === k} onClick={() => setReason(k)}>
            <span className="dot" /><span>{l}</span>{immediate && <span className="badge b-bad" style={{ marginLeft: "auto" }}>即非公開</span>}
          </button>
        ))}
      </div>
      {reason === "other" && <textarea className="input" placeholder="詳しい内容（必須・1000文字まで）" maxLength={1000} value={detail} onChange={(e) => setDetail(e.target.value)} aria-label="詳しい内容" />}
      <button className="btn btn-primary pill" style={{ height: 52 }} disabled={!canSend} onClick={send}>{busy ? "送信中…" : "送信"}</button>
      <span className="cap" style={{ textAlign: "center" }}>ログインしていなくても通報できます。通報者が投稿者に知られることはありません。</span>
    </Sheet>
  );
}

type C = { id: string; body: string; createdAt: string; handle: string; avatarHue: number; mine: boolean };

export function CommentSheet({ card, loggedIn, onClose, onPosted }: { card: VideoCard; loggedIn: boolean; onClose: () => void; onPosted: () => void }) {
  const [list, setList] = useState<C[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    api<{ comments: C[] }>(`/api/v1/videos/${card.id}/comments`).then((r) => setList(r.ok ? r.data.comments : []));
  }, [card.id]);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await api<{ comment: C; pending: boolean }>(`/api/v1/videos/${card.id}/comments`, { method: "POST", body: { body: text } });
    setBusy(false);
    if (!r.ok) { toast(r.data.error?.message ?? "送信できませんでした"); return; }
    setText("");
    if (r.data.pending) { toast("運営の確認後に表示されます"); return; }
    setList((l) => [r.data.comment, ...(l ?? [])]);
    onPosted();
  };
  const report = async (c: C) => {
    const r = await api(`/api/v1/comments/${c.id}/reports`, { method: "POST", body: { reason: "other" } });
    toast(r.ok ? "コメントを通報しました" : "通報できませんでした");
  };
  const remove = async (c: C) => {
    const r = await api(`/api/v1/comments/${c.id}`, { method: "DELETE" });
    if (r.ok) setList((l) => (l ?? []).filter((x) => x.id !== c.id));
  };
  return (
    <Sheet title={<>コメント <span className="muted num" style={{ fontSize: 14, fontWeight: 500 }}>{fmt(card.comments)}</span></>} onClose={onClose}>
      <div style={{ overflowY: "auto", maxHeight: "42dvh", minHeight: 120 }}>
        {list === null ? <p className="cap">読み込み中…</p> : list.length === 0 ? <p className="cap" style={{ textAlign: "center", padding: "24px 0" }}>まだコメントはありません。</p> :
          list.map((c) => (
            <div key={c.id} className="comment">
              <Avatar hue={c.avatarHue} size={34} />
              <div className="b"><div className="n">@{c.handle}・{ago(c.createdAt)}</div>{c.body}</div>
              {c.mine ? <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={() => remove(c)} aria-label="削除"><Icon name="trash" size={16} /></button>
                : <button className="iconbtn muted" style={{ width: 32, height: 32 }} onClick={() => report(c)} aria-label="このコメントを通報"><Icon name="flag" size={16} /></button>}
            </div>
          ))}
      </div>
      {!card.commentsEnabled ? <p className="cap" style={{ textAlign: "center" }}>投稿者がコメントをオフにしています。</p> : loggedIn ? (
        <form style={{ display: "flex", gap: 8, alignItems: "center" }} onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input className="input pill" style={{ height: 44 }} placeholder="コメントを追加（URLは書けません）" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} aria-label="コメントを入力" />
          <button className="btn-primary" style={{ width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0 }} aria-label="送信" disabled={busy}><Icon name="send" size={18} /></button>
        </form>
      ) : (
        <Link className="btn btn-secondary pill" href={`/login?next=${encodeURIComponent("/?v=" + card.id)}`}>ログインしてコメントする</Link>
      )}
    </Sheet>
  );
}

export function ShareSheet({ card, onClose }: { card: VideoCard; onClose: () => void }) {
  const toast = useToast();
  const url = typeof window !== "undefined" ? `${location.origin}/?v=${card.id}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast("リンクをコピーしました"); } catch { toast("リンクを選択してコピーしてください"); }
  };
  return (
    <Sheet title="シェア" onClose={onClose}>
      <div style={{ display: "flex", gap: 10 }}>
        <input className="input num" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="共有リンク" style={{ fontSize: 13 }} />
        <button className="btn btn-primary" style={{ width: 104, flexShrink: 0 }} onClick={copy}><Icon name="copy" size={18} />コピー</button>
      </div>
      <span className="cap">共有先でも年齢確認が表示されます。</span>
    </Sheet>
  );
}

export function MoreSheet({ card, onClose, onReport, onHide }: { card: VideoCard; onClose: () => void; onReport: () => void; onHide: () => void }) {
  return (
    <Sheet title="その他" onClose={onClose}>
      <div className="list" style={{ background: "var(--surface-2)" }}>
        <Link className="row" href={`/u/${encodeURIComponent(card.creator.handle)}`}><Icon name="user" size={20} /><span className="grow">@{card.creator.handle} のページ</span></Link>
        <button className="row" onClick={onHide}><Icon name="eyeoff" size={20} /><span className="grow">この投稿者を表示しない</span></button>
        <button className="row" onClick={onReport} style={{ color: "var(--bad)" }}><Icon name="flag" size={20} /><span className="grow">通報する</span></button>
      </div>
    </Sheet>
  );
}
