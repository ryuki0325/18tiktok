"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { createVideoAction } from "@/lib/creator-actions";
import { Check, FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";
import { usePhotos } from "@/components/upload/usePhotos";
import { useUpload } from "@/components/upload/useUpload";
import { CoverPicker } from "@/components/upload/CoverPicker";
import { normalizeEmbed } from "@/lib/embed-normalize";
import { VIDEO_CATEGORIES } from "@/lib/audience";

type Dest = { id: string; serviceName: string; domain: string };
type Draft = { id: string; title: string; poster: string | null; hue: [number, number, number] };

const MAX_TAGS = 5;
const EMBED_SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

/**
 * 投稿画面。
 * 動画は自社に保存せず、公式サンプル等の「埋め込みURL」で表示する（出どころは運営の許可リストに限定）。
 * 写真は、権利を持つ自分の宣伝用素材をアップロードできる。
 */
type Resume = {
  id: string; caption: string; tags: string[]; category: string | null; intensity: number | null;
  visibility: "public" | "private"; comments: boolean; poster: string | null; hasMedia: boolean;
  destId: string; linkUrl: string; embedUrl: string; embedFit: "cover" | "contain";
  kind: "video" | "photo"; images: { url: string; w: number; h: number }[] | null;
};

export function PostForm({ destinations, drafts, resume, maxImages, maxMb, maxSec, uploadEnabled, myLink }: {
  destinations: Dest[]; drafts: Draft[]; maxImages: number;
  maxMb: number; maxSec: number; uploadEnabled: boolean;
  resume?: Resume | null;
  myLink?: { destId: string; url: string } | null;
}) {
  const [state, action, pending] = useActionState(createVideoAction, undefined);

  // 投稿の種類。
  // upload＝動画ファイルを自社に保存（再生/一時停止/音量/速度/シークを自前で操作できる）
  // video＝公式サンプル等の埋め込みURL／photo＝写真（複数枚）
  type Mode = "upload" | "video" | "photo" | null;
  const initialMode: Mode = resume
    ? (resume.kind === "photo" ? "photo" : resume.embedUrl ? "video" : resume.hasMedia ? "upload" : "video")
    : null;
  const [mode, setMode] = useState<Mode>(initialMode);

  const [caption, setCaption] = useState(resume?.caption ?? "");
  const [cat, setCat] = useState<string | null>(resume?.category ?? null);
  const [visibility, setVisibility] = useState<"public" | "private">(resume?.visibility ?? "public");
  const [comments, setComments] = useState(resume?.comments ?? true);
  const [destId, setDestId] = useState(resume?.destId ?? myLink?.destId ?? "");
  const [linkUrl, setLinkUrl] = useState(resume?.linkUrl ?? myLink?.url ?? "");
  const [embed, setEmbed] = useState(resume?.embedUrl ?? "");
  const [embedFit, setEmbedFit] = useState<"cover" | "contain">(resume?.embedFit ?? "contain");
  const [checks, setChecks] = useState({ c1: false, c2: false, c3: false, c4: false });

  // 写真投稿（複数枚）
  const [images, setImages] = useState<{ url: string; w: number; h: number }[]>([]);
  const ph = usePhotos({ max: maxImages, onChange: setImages, initial: resume?.kind === "photo" ? resume.images : null });
  const photoInput = useRef<HTMLInputElement>(null);

  // 動画ファイルのアップロード（自社ホスト）。キャプションを書いている間も裏で送り続ける。
  const [uploadId, setUploadId] = useState<string | null>(null);
  const up = useUpload({ maxMb, maxSec, onReady: setUploadId });
  const videoInput = useRef<HTMLInputElement>(null);
  // 表紙（カバー）を選ぶシート
  const [coverOpen, setCoverOpen] = useState(false);
  // 下書きの続きで、すでに動画が付いている（アップロード済み）なら選び直さなくてよい
  const [resumedMedia] = useState(resume?.kind !== "photo" && !resume?.embedUrl && !!resume?.hasMedia);

  const isPhoto = mode === "photo";
  const isUpload = mode === "upload";
  const isEmbed = mode === "video";

  // タグは説明文の中の #ハッシュタグ から自動で拾う（最大5つ・重複なし）
  const tags = Array.from(new Set((caption.match(/#([^\s#、。,.!?！？]+)/g) ?? []).map((t) => t.slice(1)).filter(Boolean))).slice(0, MAX_TAGS);

  // 入力（URL か <iframe> コード）から埋め込み用URLを作る（プレビューと送信前チェックに使う）
  const embedPreview = isEmbed && embed.trim() ? normalizeEmbed(embed) : null;

  // 変換（processing）中でも投稿してよい：アップロード送信さえ終われば、変換は裏で続き、
  // 終わりしだい自動で再生可能になる（待たせない）。送信中(uploading)・失敗(failed)はまだ不可。
  const hasMedia = isPhoto ? (ph.readyCount > 0 && !ph.uploading)
    : isUpload ? (up.state.k === "ready" || up.state.k === "processing" || resumedMedia)
    : embed.trim().length > 0;
  const ready = hasMedia && !!cat && caption.trim().length > 0
    && !!destId && linkUrl.trim().length > 0
    && checks.c1 && checks.c2 && checks.c3 && checks.c4 && !pending;
  const canDraft = hasMedia && !pending;

  const missing = [
    !hasMedia && (isPhoto ? "写真を選ぶ" : isUpload ? "動画ファイルを選ぶ" : "埋め込みURLを入れる"),
    !cat && "ジャンルを選ぶ",
    caption.trim().length === 0 && "説明を書く",
    (!destId || linkUrl.trim().length === 0) && "「完全版を見る」のリンクを入れる",
    !(checks.c1 && checks.c2 && checks.c3 && checks.c4) && "確認事項にすべてチェックする",
  ].filter(Boolean) as string[];

  /* ---------- 1) 種類を選ぶ画面 ---------- */
  if (mode === null) {
    return (
      <div className="pick-screen">
        <div className="pick-choices">
          {uploadEnabled && (
            <button type="button" className="pick-main" onClick={() => setMode("upload")}>
              <span className="pick-glow" aria-hidden="true" />
              <span className="pick-ic"><Icon name="video" size={30} /></span>
              <b className="pick-title">動画をアップロード</b>
              <span className="pick-sub">権利を持つ動画を自社に保存して配信</span>
            </button>
          )}
          <button type="button" className={`pick-main${uploadEnabled ? " alt" : ""}`} onClick={() => setMode("video")}>
            {!uploadEnabled && <span className="pick-glow" aria-hidden="true" />}
            <span className="pick-ic"><Icon name="video" size={30} /></span>
            <b className="pick-title">動画を埋め込む</b>
            <span className="pick-sub">公式サンプルの埋め込みURLを貼る</span>
          </button>
          <button type="button" className="pick-main alt" onClick={() => photoInput.current?.click()}>
            <span className="pick-ic"><Icon name="images" size={30} /></span>
            <b className="pick-title">写真を投稿</b>
            <span className="pick-sub">権利を持つ宣伝用の画像を選ぶ</span>
          </button>
          <input ref={photoInput} type="file" accept="image/*" multiple hidden aria-label="写真を選ぶ"
            onChange={(e) => { const fs = e.target.files ? Array.from(e.target.files) : []; e.target.value = ""; if (fs.length) { setMode("photo"); void ph.add(fs); } }} />
        </div>

        {drafts.length > 0 && (
          <section style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="label">下書き<small>{drafts.length}件</small></span>
            <div className="hscroll">
              {drafts.map((d) => (
                <Link key={d.id} className="draft-card" href={`/creator/new?draft=${d.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {d.poster ? <img src={d.poster} alt="" /> : <span className="ph" style={{ background: `linear-gradient(160deg, hsl(${d.hue[0]} 40% 24%), hsl(${d.hue[1]} 40% 12%))` }} />}
                  <span className="t">{d.title || "（無題）"}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <Link href="/legal/guidelines" className="pick-guide">
          <span className="pick-guide-ic"><Icon name="shield" size={18} /></span>
          <span>
            載せられるのは、<b>提携先の正規流通作品（公式サンプル）や、自分が権利を持つ素材</b>だけです。本編は公式サイトで視聴してもらいます。
            <span className="pick-guide-link">投稿ガイドラインを読む<Icon name="chev" size={14} /></span>
          </span>
        </Link>
      </div>
    );
  }

  /* ---------- 2) 投稿の内容を決める画面 ---------- */
  return (
    <form action={action} className="composer">
      <input type="hidden" name="kind" value={isPhoto ? "photo" : "video"} />
      {isPhoto && <input type="hidden" name="images" value={JSON.stringify(images)} />}
      {isUpload && <input type="hidden" name="uploadId" value={uploadId ?? ""} />}
      {isEmbed && <input type="hidden" name="embed" value={embed.trim()} />}
      {isEmbed && <input type="hidden" name="embedFit" value={embedFit} />}
      {resume && <input type="hidden" name="draftId" value={resume.id} />}
      <input type="hidden" name="visibility" value={visibility} />
      <input type="hidden" name="commentsEnabled" value={comments ? "on" : "off"} />
      {cat && <input type="hidden" name="category" value={cat} />}
      {tags.map((t) => <input key={t} type="hidden" name="tags" value={t} />)}
      <input type="hidden" name="title" value={caption.split("\n")[0].slice(0, 60)} />
      <input type="hidden" name="description" value={caption.slice(0, 300)} />
      <input type="hidden" name="link" value={destId ? linkUrl : ""} />

      <div className="sec" style={{ gap: 18, paddingBottom: 16 }}>
        {/* 動画＝自社アップロード（再生/一時停止/音量/速度/シークを自前で操作できる） */}
        {isUpload && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="label">動画ファイル<small className="req">必須</small></span>
            {up.previewUrl ? (
              <div style={{ borderRadius: 12, overflow: "hidden", background: "#000", maxHeight: 360 }}>
                <video src={up.previewUrl} poster={up.cover ?? undefined} controls playsInline muted
                  style={{ width: "100%", maxHeight: 360, display: "block", objectFit: "contain" }} />
              </div>
            ) : resumedMedia ? (
              <span className="cap num" style={{ color: "var(--ok)" }}><Icon name="check" size={14} /> アップロード済みの動画を使います</span>
            ) : null}

            {up.state.k === "reading" && <span className="cap num"><span className="spinner spin" /> 動画を読み込み中…</span>}
            {(up.state.k === "uploading" || up.state.k === "paused") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ height: 6, borderRadius: 3, background: "var(--line, #2a2a2a)", overflow: "hidden" }}>
                  <i style={{ display: "block", height: "100%", width: `${up.pct}%`, background: "var(--accent)" }} />
                </div>
                <span className="cap num">
                  {up.state.k === "paused" ? (up.state.message ?? "一時停止中です") : `送信中… ${up.pct}%`}
                  {up.state.k === "uploading"
                    ? <button type="button" className="cap-chip" onClick={up.pause} style={{ marginLeft: 8 }}>一時停止</button>
                    : <button type="button" className="cap-chip" onClick={up.resume} style={{ marginLeft: 8 }}>再開</button>}
                </span>
              </div>
            )}
            {up.state.k === "processing" && <span className="cap num"><span className="spinner spin" /> 変換中です…（このまま投稿できます。完了後に再生できます）</span>}
            {up.state.k === "ready" && <span className="cap num" style={{ color: "var(--ok)" }}><Icon name="check" size={14} /> アップロード完了</span>}
            {up.state.k === "failed" && <span className="cap" style={{ color: "var(--bad)" }}>{up.state.message}</span>}

            {/* 表紙（カバー）＝一覧やフィードでずっと表紙として出る。コマ送りから選ぶ／画像をアップロード */}
            {up.state.k === "ready" && up.file && uploadId && (
              <button type="button" className="cap-chip" onClick={() => setCoverOpen(true)} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="images" size={14} /> {up.cover ? "表紙（カバー）を変える" : "表紙（カバー）を設定する"}
              </button>
            )}

            <button type="button" className="cap-chip" onClick={() => videoInput.current?.click()} style={{ alignSelf: "flex-start" }}>
              {up.state.k === "idle" && !resumedMedia ? "動画ファイルを選ぶ" : "別の動画に差し替える"}
            </button>
            <input ref={videoInput} type="file" accept="video/*" hidden aria-label="動画ファイルを選ぶ"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void up.pick(f); }} />

            <span className="cap" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, lineHeight: 0, marginTop: 2 }}><Icon name="shield" size={14} /></span>
              <span>
                アップロードできるのは、<b>自分が権利を持つ動画</b>だけです（{maxMb >= 1024 ? `${Math.round(maxMb / 1024 * 10) / 10}GB` : `${maxMb}MB`}・最長 {Math.floor(maxSec / 60)}分）。
                この動画は<b>再生・一時停止・音量・速度・シーク</b>をVYBE側で操作できます。
              </span>
            </span>
          </div>
        )}

        {/* 動画＝埋め込みURL／コード */}
        {isEmbed && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="label">埋め込みURL／コード<small className="req">必須</small></span>
            <textarea className="input num" value={embed} onChange={(e) => setEmbed(e.target.value)} rows={2}
              placeholder="https://… または『共有→埋め込み』の <iframe …> コード" aria-label="埋め込みURL" style={{ minHeight: 46, resize: "vertical" }} />
            {/* 入力から埋め込みプレビューを出して、投稿前に表示を確認できる */}
            {embed.trim() && (embedPreview
              ? <div className="fembed-preview">
                  <iframe src={embedPreview} sandbox={EMBED_SANDBOX} allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                    referrerPolicy="no-referrer-when-downgrade" title="埋め込みプレビュー" />
                  <span className="cap" style={{ display: "block", marginTop: 6 }}>↑ ここに動画が出れば表示できます。<b>真っ白のまま</b>なら、そのサイトは埋め込み非対応です（下の案内を参照）。</span>
                </div>
              : <span className="cap" style={{ color: "var(--warn)" }}>この入力からは埋め込みを作れません。URL か <code>&lt;iframe…&gt;</code> のコードを貼ってください。</span>)}
            {/* 動画の向き：縦長は全画面、横長は全体表示（切らない） */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label">動画の向き</span>
              <div className="seg" role="radiogroup" aria-label="動画の向き">
                <button type="button" role="radio" aria-checked={embedFit === "cover"} onClick={() => setEmbedFit("cover")}>縦長（全画面）</button>
                <button type="button" role="radio" aria-checked={embedFit === "contain"} onClick={() => setEmbedFit("contain")}>横長（全体表示）</button>
              </div>
              <span className="cap">縦長の動画（Shorts等）は<b>全画面</b>、横長の動画（16:9）は<b>全体表示</b>がきれいです。横長で全画面にすると左右が切れます。</span>
            </div>
            <span className="cap" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, lineHeight: 0, marginTop: 2 }}><Icon name="shield" size={14} /></span>
              <span>
                動画は<b>自社に保存しません</b>。権利を持つ素材・正規流通作品の公式サンプルを埋め込んでください。<br />
                <b>X(Twitter)・Instagram・TikTok・YouTube・Vimeo</b> などは、投稿の<b>普通のURL</b>を貼るだけでOK。その他のサイトは、そのサイトの<b>「共有 → 埋め込み」</b>で出る <code>&lt;iframe…&gt;</code> のコードを貼ってください。
                <br /><small>※「本編ページのURL」をそのまま貼ると、多くのサイトは埋め込みを禁止しているため真っ白になります。</small>
              </span>
            </span>
          </div>
        )}

        {/* 写真投稿 */}
        {isPhoto && (
          <div className="photo-strip" role="list" aria-label="選んだ写真">
            {ph.photos.map((pt) => (
              <div key={pt.key} className="photo-item" role="listitem">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pt.previewUrl} alt="" />
                {pt.state === "uploading" && <span className="ph-busy"><span className="spinner spin dark" /></span>}
                {pt.state === "failed" && <span className="ph-busy" style={{ color: "var(--bad)", fontSize: 11 }}>失敗</span>}
                <button type="button" className="ph-x" aria-label="この写真を外す" onClick={() => ph.remove(pt.key)}><Icon name="x" size={14} /></button>
              </div>
            ))}
            {ph.photos.length < maxImages && (
              <button type="button" className="photo-add" onClick={() => photoInput.current?.click()} aria-label="写真を追加">
                <Icon name="plus" size={24} /><span>追加</span>
              </button>
            )}
            <input ref={photoInput} type="file" accept="image/*" multiple hidden aria-label="写真を追加する"
              onChange={(e) => { void ph.add(e.target.files ? Array.from(e.target.files) : []); e.currentTarget.value = ""; }} />
          </div>
        )}
        {isPhoto && (
          <span className="cap num">{ph.uploading ? "写真を取り込み中です…" : `写真 ${ph.readyCount} 枚の準備ができました`}</span>
        )}

        {/* 説明 */}
        <div className="cap-row">
          <textarea className="cap-input" value={caption} onChange={(e) => setCaption(e.target.value)}
            maxLength={300} rows={5} placeholder="説明を書く…　#タグ をつけると見つけてもらいやすくなります" aria-label="説明" />
        </div>
        <div className="cap-meta">
          <span className="cap num">{caption.length}/300</span>
          <button type="button" className="cap-chip" onClick={() => setCaption((c) => `${c}#`)}>#タグを入れる</button>
          <button type="button" className="cap-chip" onClick={() => setMode(null)}>種類を選び直す</button>
        </div>
        <span className="cap">説明文に <b>#タグ</b> をつけると、そのまま「探す」に反映されます{tags.length > 0 && `（${tags.map((t) => `#${t}`).join(" ")}）`}。</span>

        {/* 必須の分類 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">ジャンル<small className="req">必須</small><small>・視聴者の最初の分岐に使われます</small></span>
          <div className="seg" role="radiogroup" aria-label="ジャンル">
            {VIDEO_CATEGORIES.map((c) => <button type="button" key={c.id} role="radio" aria-checked={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>)}
          </div>
        </div>

        {/* 公開の設定 */}
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

        {/* 完全版を見る（承認済みの送客先から選ぶ） */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">「完全版を見る」のリンク<small className="req">必須</small></span>
          {destinations.length === 0 ? (
            <span className="cap">いまは使える送客先がありません。運営にサービスの追加を依頼してください。</span>
          ) : (
            <>
              <select className="input" value={destId} onChange={(e) => setDestId(e.target.value)} style={{ height: 46 }} aria-label="送客先のサービス">
                <option value="">選んでください</option>
                {destinations.map((d) => <option key={d.id} value={d.id}>{d.serviceName}（{d.domain}）</option>)}
              </select>
              {destId && (
                <>
                  <input className="input num" type="url" inputMode="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder={`https://${destinations.find((d) => d.id === destId)?.domain}/...`} aria-label="自分のページのURL" />
                  <span className="cap" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <span style={{ flexShrink: 0, lineHeight: 0, marginTop: 2 }}><Icon name="shield" size={14} /></span>
                    <span>この投稿は<b>サンプル</b>として扱われます。完全版を売っている自分のページのURLを入れてください。
                    選んだサービスのURLだけ登録できます。短縮URLは使えません。移動の前に確認画面とPR表記が出ます。</span>
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* 確認事項 */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="label" style={{ marginBottom: 4 }}>確認事項<small className="req">すべて必須</small></span>
          {(["c1", "c2", "c3"] as const).map((k, i) => (
            <span key={k} onChange={(e) => setChecks((c) => ({ ...c, [k]: (e.target as HTMLInputElement).checked }))}>
              <Check name={k}>{[
                "載せる素材は、提携先が許可した正規流通作品の公式サンプル、または自分が権利を持つものです",
                "出演者は全員が18歳以上で、インターネットでの公開に同意しています",
                "児童ポルノ・リベンジポルノ・盗撮・無断アップロード作品ではありません",
              ][i]}</Check>
            </span>
          ))}
          <span onChange={(e) => setChecks((c) => ({ ...c, c4: (e.target as HTMLInputElement).checked }))}>
            <Check name="c4">
              <Link href="/legal/post-consent" target="_blank" style={{ color: "var(--accent)", textDecoration: "underline" }}>投稿前の確認・誓約事項</Link>
              と<Link href="/legal/guidelines" target="_blank" style={{ color: "var(--accent)", textDecoration: "underline" }}>投稿ガイドライン</Link>を読み、すべてに同意します
            </Check>
          </span>
          <span className="cap" style={{ marginTop: 4 }}>同意の内容と日時は、変更できない記録として保存されます。虚偽の同意は、アカウント停止・法的措置の対象になります。</span>
        </div>

        {/* 足りない項目 */}
        {!pending && missing.length > 0 && (
          <div className="notice warn" role="status" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <b style={{ fontSize: 14 }}>投稿するには、あと{missing.length}つ必要です</b>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {missing.map((m) => (
                <li key={m} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                  <span aria-hidden style={{ color: "var(--bad)", fontWeight: 800 }}>✕</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <FormMessage state={state} />
      </div>

      <div className="bottom-fixed">
        <button className="btn btn-secondary" name="intent" value="draft" disabled={!canDraft}>下書き保存</button>
        <button className="btn btn-primary" name="intent" value="submit" disabled={!ready}>{pending ? "送信中…" : "投稿する"}</button>
      </div>

      {coverOpen && up.file && uploadId && (
        <CoverPicker
          file={up.file}
          uploadId={uploadId}
          durationMs={up.info?.durationMs ?? 0}
          onClose={(cover) => { if (cover?.changed && cover.dataUrl) up.setCover(cover.dataUrl); setCoverOpen(false); }}
        />
      )}
    </form>
  );
}
