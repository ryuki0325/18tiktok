"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { VideoCard } from "@/lib/content";
import { Icon } from "../Icon";
import { ProfileAvatar } from "../profile/ProfileAvatar";
import { ago, fmt } from "../format";
import { useToast } from "../Toast";
import { api } from "./api";
import { ReportSheet } from "../ReportSheet";

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

export type C = {
  id: string; body: string; createdAt: string; handle: string; avatarHue: number; avatarUrl: string | null;
  mine: boolean; likes: number; liked: boolean; parentId?: string | null;
  replyCount?: number; replies?: C[];
};

/**
 * コメント（TikTokと同じ2段構成）。
 * 新しいコメントが上、その下に返信が少しだけ並び、「返信をもっと見る」で続きを読む。
 * 右端のハートでコメントにいいねできる。
 */
export function CommentSheet({ card, loggedIn, onClose, onPosted }: { card: VideoCard; loggedIn: boolean; onClose: () => void; onPosted: () => void }) {
  const [list, setList] = useState<C[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; handle: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    api<{ comments: C[] }>(`/api/v1/videos/${card.id}/comments`).then((r) => setList(r.ok ? r.data.comments : []));
  }, [card.id]);

  /** 1件を書き換える（本体でも返信でも） */
  const patch = (id: string, f: (c: C) => C) => setList((l) => (l ?? []).map((c) =>
    c.id === id ? f(c) : c.replies?.some((x) => x.id === id) ? { ...c, replies: c.replies.map((x) => (x.id === id ? f(x) : x)) } : c));

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await api<{ comment: C; pending: boolean }>(`/api/v1/videos/${card.id}/comments`, { method: "POST", body: { body: text, parentId: replyTo?.id ?? null } });
    setBusy(false);
    if (!r.ok) { toast(r.data.error?.message ?? "送信できませんでした"); return; }
    setText("");
    const to = replyTo;
    setReplyTo(null);
    if (r.data.pending) { toast("運営の確認後に表示されます"); return; }
    const c = r.data.comment;
    if (to) setList((l) => (l ?? []).map((x) => (x.id === (c.parentId ?? to.id) ? { ...x, replyCount: (x.replyCount ?? 0) + 1, replies: [...(x.replies ?? []), c] } : x)));
    else setList((l) => [{ ...c, replies: [], replyCount: 0 }, ...(l ?? [])]);
    onPosted();
  };

  const like = async (c: C) => {
    patch(c.id, (x) => ({ ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) }));
    const r = await api(`/api/v1/comments/${c.id}/like`, { method: c.liked ? "DELETE" : "PUT" });
    if (!r.ok) patch(c.id, (x) => ({ ...x, liked: c.liked, likes: c.likes }));
  };
  // コメントの通報は、動画と同じ共通のシートを開く
  const [reporting, setReporting] = useState<C | null>(null);
  const remove = async (c: C) => {
    const r = await api(`/api/v1/comments/${c.id}`, { method: "DELETE" });
    if (!r.ok) { toast("削除できませんでした"); return; }
    setList((l) => (l ?? []).filter((x) => x.id !== c.id).map((x) => (x.replies?.some((y) => y.id === c.id) ? { ...x, replies: x.replies.filter((y) => y.id !== c.id), replyCount: Math.max(0, (x.replyCount ?? 1) - 1) } : x)));
  };
  const openReply = (c: C) => { setReplyTo({ id: c.id, handle: c.handle }); setTimeout(() => input.current?.focus(), 30); };
  const more = async (c: C) => {
    const r = await api<{ replies: C[] }>(`/api/v1/videos/${card.id}/comments?parent=${c.id}`);
    if (r.ok) patch(c.id, (x) => ({ ...x, replies: r.data.replies }));
  };

  const total = (list ?? []).reduce((n, c) => n + 1 + (c.replyCount ?? 0), 0);
  return (
    <Sheet title={<>コメント <span className="muted num" style={{ fontSize: 14, fontWeight: 500 }}>{fmt(list ? total : card.comments)}</span></>} onClose={onClose}>
      <div className="cmts">
        {list === null ? <p className="cap">読み込み中…</p>
          : list.length === 0 ? <div className="cmt-empty"><b>まだコメントはありません</b><span className="cap">最初のひとことを書いてみませんか。</span></div>
            : list.map((c) => (
              <div key={c.id}>
                <CommentRow c={c} onLike={like} onReply={openReply} onReport={setReporting} onRemove={remove} />
                {c.replies?.map((r) => <CommentRow key={r.id} c={r} reply onLike={like} onReply={openReply} onReport={setReporting} onRemove={remove} />)}
                {(c.replyCount ?? 0) > (c.replies?.length ?? 0) && (
                  <button className="cmt-more" onClick={() => more(c)}>返信をもっと見る（{(c.replyCount ?? 0) - (c.replies?.length ?? 0)}件）</button>
                )}
              </div>
            ))}
      </div>
      {reporting && <ReportSheet targetType="comment" targetId={reporting.id} label={reporting.body.slice(0, 20)} onClose={(hidden) => { setReporting(null); if (hidden) setList((l) => (l ?? []).filter((x) => x.id !== reporting.id)); }} />}
      {!card.commentsEnabled ? <p className="cap" style={{ textAlign: "center" }}>投稿者がコメントをオフにしています。</p> : loggedIn ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {replyTo && (
            <div className="cmt-replying">
              <span className="cap">@{replyTo.handle} に返信中</span>
              <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => setReplyTo(null)} aria-label="返信をやめる"><Icon name="x" size={16} /></button>
            </div>
          )}
          <form style={{ display: "flex", gap: 8, alignItems: "center" }} onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input ref={input} className="input pill" style={{ height: 44 }} placeholder={replyTo ? `@${replyTo.handle} に返信…` : "コメントを追加（URLは書けません）"} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} aria-label="コメントを入力" />
            <button className="btn-primary" style={{ width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0 }} aria-label="送信" disabled={busy}><Icon name="send" size={18} /></button>
          </form>
        </div>
      ) : (
        <Link className="btn btn-secondary pill" href={`/login?next=${encodeURIComponent("/?v=" + card.id)}`}>ログインしてコメントする</Link>
      )}
    </Sheet>
  );
}

function CommentRow({ c, reply = false, onLike, onReply, onReport, onRemove }: {
  c: C; reply?: boolean; onLike: (c: C) => void; onReply: (c: C) => void; onReport: (c: C) => void; onRemove: (c: C) => void;
}) {
  return (
    <div className={`cmt${reply ? " reply" : ""}`}>
      <Link href={`/u/${encodeURIComponent(c.handle)}`} aria-label={`@${c.handle} のページ`}><ProfileAvatar hue={c.avatarHue} url={c.avatarUrl} size={reply ? 28 : 36} /></Link>
      <div className="b">
        <div className="n">@{c.handle}</div>
        <div className="t">{c.body}</div>
        <div className="f">
          <span className="cap">{ago(c.createdAt)}</span>
          <button onClick={() => onReply(c)}>返信</button>
          {c.mine ? <button onClick={() => onRemove(c)}>削除</button> : <button onClick={() => onReport(c)}>通報</button>}
        </div>
      </div>
      <button className={`cmt-like${c.liked ? " on" : ""}`} onClick={() => onLike(c)} aria-pressed={c.liked} aria-label={c.liked ? "いいねを取り消す" : "いいね"}>
        <Icon name="heart" size={17} filled={c.liked} />
        <span className="num">{c.likes || ""}</span>
      </button>
    </div>
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

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/**
 * 「…」メニュー：共有・興味がない・通報・動画速度設定をここにまとめる
 */
export function MoreSheet({ card, rate, loggedIn, mine, onClose, onShare, onNotInterested, onHideCreator, onReport, onRate, onHidePost, onDeletePost }: {
  card: VideoCard; rate: number; loggedIn: boolean; mine: boolean; onClose: () => void; onShare: () => void; onNotInterested: () => void; onHideCreator: () => void; onReport: () => void; onRate: (r: number) => void;
  onHidePost: () => void; onDeletePost: () => void;
}) {
  const [view, setView] = useState<"main" | "ni" | "speed" | "collect" | "delete">("main");
  const isPhoto = card.kind === "photo";
  return (
    <Sheet title={view === "speed" ? "動画速度" : view === "ni" ? "興味がない" : view === "collect" ? "コレクションに追加" : view === "delete" ? "削除の確認" : "その他"} onClose={onClose}>
      {view === "main" && (
        <>
          {mine && (
            // 自分の投稿のときは、非公開・削除をいちばん上に出す
            <div className="list" style={{ background: "var(--surface-2)", marginBottom: 12 }}>
              <button className="row" onClick={onHidePost}><Icon name="eyeoff" size={20} /><span className="grow">非公開にする<span className="cap" style={{ display: "block" }}>自分だけが見られる状態にします（あとで公開に戻せます）</span></span></button>
              <button className="row" onClick={() => setView("delete")}><span style={{ color: "var(--bad)", display: "inline-flex" }}><Icon name="trash" size={20} /></span><span className="grow" style={{ color: "var(--bad)" }}>削除する<span className="cap" style={{ display: "block" }}>この{isPhoto ? "写真" : "動画"}を完全に削除します</span></span></button>
            </div>
          )}
          <div className="acts" role="group" aria-label="操作">
            <button onClick={onShare}><span className="ic"><Icon name="share" size={24} /></span>共有</button>
            {loggedIn && <button onClick={() => setView("collect")}><span className="ic"><Icon name="bookmark" size={24} /></span>コレクション</button>}
            {!mine && <button onClick={() => setView("ni")}><span className="ic"><Icon name="eyeoff" size={24} /></span>興味がない</button>}
            {!mine && <button onClick={onReport}><span className="ic bad"><Icon name="flag" size={24} /></span>通報</button>}
            {!isPhoto && <button onClick={() => setView("speed")}><span className="ic"><Icon name="gauge" size={24} /></span>動画速度<small className="num">{rate}x</small></button>}
          </div>
        </>
      )}
      {view === "delete" && (
        <div className="list" style={{ background: "var(--surface-2)" }}>
          <p style={{ padding: "4px 14px 10px", margin: 0, fontSize: 14 }}>この{isPhoto ? "写真" : "動画"}を削除します。元に戻せません。よろしいですか？</p>
          <button className="row" onClick={onDeletePost}><span style={{ color: "var(--bad)", display: "inline-flex" }}><Icon name="trash" size={20} /></span><span className="grow" style={{ color: "var(--bad)", fontWeight: 700 }}>削除する</span></button>
          <button className="row" onClick={() => setView("main")}><Icon name="back" size={20} /><span className="grow">やめる</span></button>
        </div>
      )}
      {view === "collect" && <CollectPicker videoId={card.id} />}
      {view === "ni" && (
        <div className="list" style={{ background: "var(--surface-2)" }}>
          <button className="row" onClick={onNotInterested}><Icon name="eyeoff" size={20} /><span className="grow">この動画に興味がない<span className="cap" style={{ display: "block" }}>おすすめに表示されなくなります</span></span></button>
          <button className="row" onClick={onHideCreator}><Icon name="user" size={20} /><span className="grow">@{card.creator.handle} の動画を表示しない<span className="cap" style={{ display: "block" }}>設定 › 表示しない投稿者 から戻せます</span></span></button>
        </div>
      )}
      {view === "speed" && (
        <div className="seg" role="radiogroup" aria-label="動画速度">
          {RATES.map((r) => <button key={r} role="radio" aria-checked={rate === r} className="num" onClick={() => onRate(r)}>{r === 1 ? "標準" : `${r}x`}</button>)}
        </div>
      )}
    </Sheet>
  );
}


/** コレクション（フォルダ）に入れる・外す。開いたときに一覧を取りにいく */
function CollectPicker({ videoId }: { videoId: string }) {
  const [cols, setCols] = useState<{ id: string; name: string; count: number; has: boolean }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = async () => {
    const r = await fetch(`/api/v1/collections?video=${videoId}`).then((x) => x.json()).catch(() => null);
    setCols(r?.collections ?? []);
  };
  useEffect(() => { void load(); }, []);
  const toggle = async (id: string) => {
    setBusy(id);
    const r = await fetch("/api/v1/collections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ collectionId: id, videoId }) }).then((x) => x.json()).catch(() => null);
    if (r && typeof r.added === "boolean") setCols((cs) => cs?.map((c) => (c.id === id ? { ...c, has: r.added, count: c.count + (r.added ? 1 : -1) } : c)) ?? null);
    setBusy(null);
  };
  if (cols === null) return <span className="cap">読み込み中…</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {cols.length === 0 && <span className="cap">コレクションがありません。「作成・管理」から作れます。</span>}
      <div className="list" style={{ background: "var(--surface-2)" }}>
        {cols.map((c) => (
          <button key={c.id} className="row" onClick={() => void toggle(c.id)} disabled={busy === c.id} aria-pressed={c.has}>
            <Icon name="bookmark" size={20} filled={c.has} />
            <span className="grow" style={{ textAlign: "left" }}><b>{c.name}</b><span className="cap num" style={{ marginLeft: 8 }}>{c.count}件</span></span>
            <Icon name={c.has ? "check" : "plus"} size={18} />
          </button>
        ))}
      </div>
      <a className="btn btn-secondary pill" href="/collections">コレクションを作成・管理</a>
    </div>
  );
}
