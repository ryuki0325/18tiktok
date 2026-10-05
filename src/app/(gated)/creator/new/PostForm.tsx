"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { createVideoAction } from "@/lib/creator-actions";
import { Check, FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";
import { CoverPicker } from "@/components/upload/CoverPicker";
import { useUpload } from "@/components/upload/useUpload";
import { INTENSITIES, VIDEO_CATEGORIES } from "@/lib/audience";

type Dest = { id: string; serviceName: string; domain: string };
type Draft = { id: string; title: string; poster: string | null; hue: [number, number, number] };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 100 * 1024 * 1024 ? 0 : 1)}MB`;
const MAX_TAGS = 5;

/**
 * 投稿画面（TikTok と同じ流れ）。
 * 1) 動画を選ぶ  2) 選んだ瞬間から裏で送りながら、説明・表紙・公開設定を決める
 * 下のボタンは「下書き保存」と「審査に提出」の2つ。
 */
export function PostForm({ tags, destinations, upload, drafts }: {
  tags: string[]; destinations: Dest[]; upload: { maxMb: number; maxSec: number } | null; drafts: Draft[];
}) {
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [state, action, pending] = useActionState(createVideoAction, undefined);
  const up = useUpload({ maxMb: upload?.maxMb ?? 0, maxSec: upload?.maxSec ?? 0, onReady: setUploadId });
  const input = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [lv, setLv] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [comments, setComments] = useState(true);
  const [destId, setDestId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [checks, setChecks] = useState({ c1: false, c2: false, c3: false });
  const [coverOpen, setCoverOpen] = useState(false);

  // 保存先が未設定のときは、動画なしで先に内容だけ登録できる（運営が設定するまでの間）
  const chosen = !upload || !!up.file;
  const ready = (!upload || !!uploadId) && !!cat && !!lv && caption.trim().length > 0 && sel.length > 0
    && checks.c1 && checks.c2 && checks.c3 && !pending;
  // 下書きは、動画さえ送れていれば保存できる
  const canDraft = (!upload || !!uploadId) && !pending;

  const toggleTag = (t: string) =>
    setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : s.length < MAX_TAGS ? [...s, t] : s));

  /* ---------- 1) 動画を選ぶ画面 ---------- */
  if (!chosen) {
    return (
      <div className="pick-screen">
        <input ref={input} type="file" accept="video/*" hidden aria-label="動画ファイル"
          onChange={(e) => void up.pick(e.target.files?.[0])} />
        <button type="button" className="pick-main" onClick={() => input.current?.click()}>
          <span className="ic"><Icon name="upload" size={34} /></span>
          <b>動画を選ぶ</b>
          <span className="cap">
            縦長がおすすめ（横長もそのまま表示されます）<br />
            {upload && <>{Math.floor(upload.maxSec / 60)}分・{upload.maxMb >= 1024 ? `${upload.maxMb / 1024}GB` : `${upload.maxMb}MB`}まで</>}
          </span>
        </button>
        {up.state.k === "failed" && <p className="cap" style={{ color: "var(--bad)", textAlign: "center" }}>{up.state.message}</p>}
        {up.state.k === "reading" && <p className="cap" style={{ textAlign: "center" }}>動画を読み込んでいます…</p>}

        {drafts.length > 0 && (
          <section style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="label">下書き<small>{drafts.length}件</small></span>
            <div className="hscroll">
              {drafts.map((d) => (
                <Link key={d.id} className="draft-card" href="/creator/videos">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {d.poster ? <img src={d.poster} alt="" /> : <span className="ph" style={{ background: `linear-gradient(160deg, hsl(${d.hue[0]} 40% 24%), hsl(${d.hue[1]} 40% 12%))` }} />}
                  <span className="t">{d.title || "（無題）"}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <p className="cap" style={{ textAlign: "center", maxWidth: 320, lineHeight: 1.7 }}>
          投稿できるのは、<b>自分が権利を持ち、出演者全員が18歳以上で公開に同意している動画</b>だけです。
          <Link href="/legal/guidelines" style={{ color: "var(--accent)" }}>投稿ガイドライン</Link>を必ずお読みください。
        </p>
      </div>
    );
  }

  /* ---------- 2) 投稿の内容を決める画面 ---------- */
  const st = up.state;
  const statusLine =
    st.k === "uploading" ? `アップロード中 ${up.pct}%（${mb(st.sent)} / ${mb(st.total)}）`
      : st.k === "paused" ? `一時停止中 ${up.pct}%`
        : st.k === "processing" ? "画質ごとに変換中です（このまま投稿できます）"
          : st.k === "ready" ? "動画の準備ができました"
            : st.k === "failed" ? st.message : "";

  return (
    <form action={action} className="composer">
      <input type="hidden" name="uploadId" value={uploadId ?? ""} />
      <input type="hidden" name="visibility" value={visibility} />
      <input type="hidden" name="commentsEnabled" value={comments ? "on" : "off"} />
      {cat && <input type="hidden" name="category" value={cat} />}
      {lv && <input type="hidden" name="intensity" value={lv} />}
      {sel.map((t) => <input key={t} type="hidden" name="tags" value={t} />)}
      <input type="hidden" name="title" value={caption.split("\n")[0].slice(0, 60)} />
      <input type="hidden" name="description" value={caption.slice(0, 300)} />
      <input type="hidden" name="link" value={destId ? linkUrl : ""} />

      {/* 送信の進み具合は常に上に出す */}
      {statusLine && (
        <div className={`up-head${st.k === "failed" ? " bad" : ""}`}>
          <div className="up-bar"><i style={{ transform: `scaleX(${up.pct / 100})` }} /></div>
          <div className="up-row">
            <span className="cap num">{statusLine}</span>
            {st.k === "uploading" && <button type="button" className="btn btn-sm btn-secondary" onClick={up.pause}>一時停止</button>}
            {st.k === "paused" && <button type="button" className="btn btn-sm btn-primary" onClick={() => void up.resume()}>再開</button>}
          </div>
          {st.k === "paused" && st.message && <span className="cap" style={{ color: "var(--warn)" }}>{st.message}</span>}
        </div>
      )}

      <div className="sec" style={{ gap: 18, paddingBottom: 16 }}>
        {!upload && (
          <div className="notice info" role="status">
            <Icon name="alert" size={18} />
            <span>動画ファイルのアップロードは準備中です。いまは内容だけ先に登録できます（動画は抽象的な表示になります）。</span>
          </div>
        )}

        {/* 説明＋表紙（TikTok と同じ並び） */}
        <div className="cap-row">
          <textarea className="cap-input" value={caption} onChange={(e) => setCaption(e.target.value)}
            maxLength={300} rows={5} placeholder="説明を書く…　#タグ をつけると見つけてもらいやすくなります" aria-label="説明" />
          {upload && (
            <button type="button" className="cover-btn" onClick={() => setCoverOpen(true)} disabled={!up.file || st.k !== "ready"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {up.cover ? <img src={up.cover} alt="" /> : <span className="ph"><Icon name="video" size={22} /></span>}
              <span className="lbl">{st.k === "ready" ? "表紙を選ぶ" : "準備中…"}</span>
            </button>
          )}
        </div>
        <div className="cap-meta">
          <span className="cap num">{caption.length}/300</span>
          <button type="button" className="cap-chip" onClick={() => setCaption((c) => `${c}#`)}>#タグを入れる</button>
          {upload && <button type="button" className="cap-chip" onClick={up.reset}>動画を選び直す</button>}
        </div>

        {/* タグ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">タグ<small>必須・最大{MAX_TAGS}つ（{sel.length}/{MAX_TAGS}）</small></span>
          <div className="tag-wrap">
            {tags.map((t) => (
              <button type="button" key={t} className="chip" aria-pressed={sel.includes(t)} onClick={() => toggleTag(t)}>#{t}</button>
            ))}
          </div>
        </div>

        {/* 必須の分類 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">ジャンル（出演者）<small>必須・視聴者の最初の分岐に使われます</small></span>
          <div className="seg" role="radiogroup" aria-label="ジャンル">
            {VIDEO_CATEGORIES.map((c) => <button type="button" key={c.id} role="radio" aria-checked={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">刺激の強さ<small>必須・視聴者の絞り込みに使われます</small></span>
          <div className="seg" role="radiogroup" aria-label="刺激の強さ">
            {INTENSITIES.map((x) => <button type="button" key={x.level} role="radio" aria-checked={lv === x.level} onClick={() => setLv(x.level)}>{x.label}</button>)}
          </div>
          {lv && <span className="cap">{INTENSITIES.find((x) => x.level === lv)?.desc}。実際の内容より弱く選ぶと差し戻しの対象になります。</span>}
        </div>

        {/* 公開の設定（TikTok の「この動画を見られる人」と同じ並び） */}
        <div className="opt-list">
          <div className="opt">
            <Icon name="eye" size={20} />
            <span className="grow">この動画を見られる人</span>
            <div className="seg mini" role="radiogroup" aria-label="この動画を見られる人">
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
          <span className="label">「完全版を見る」のリンク<small>任意</small></span>
          {destinations.length === 0 ? (
            <span className="cap">いまは使える送客先がありません。運営にサービスの追加を依頼してください。</span>
          ) : (
            <>
              <select className="input" value={destId} onChange={(e) => setDestId(e.target.value)} style={{ height: 46 }} aria-label="送客先のサービス">
                <option value="">使わない</option>
                {destinations.map((d) => <option key={d.id} value={d.id}>{d.serviceName}（{d.domain}）</option>)}
              </select>
              {destId && (
                <>
                  <input className="input num" type="url" inputMode="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder={`https://${destinations.find((d) => d.id === destId)?.domain}/...`} aria-label="自分のページのURL" />
                  <span className="cap" style={{ display: "flex", gap: 6 }}>
                    <Icon name="shield" size={14} />
                    選んだサービスのURLだけ登録できます。短縮URLは使えません。移動の前に確認画面とPR表記が出ます。
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* 確認事項 */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span className="label" style={{ marginBottom: 4 }}>確認事項<small>すべて必須</small></span>
          {(["c1", "c2", "c3"] as const).map((k, i) => (
            <span key={k} onChange={(e) => setChecks((c) => ({ ...c, [k]: (e.target as HTMLInputElement).checked }))}>
              <Check name={k}>{["自分が撮影・出演し、権利を持つ動画です", "出演者全員が18歳以上で、公開に同意しています", "他人の動画の転載・切り抜きではありません"][i]}</Check>
            </span>
          ))}
          <span className="cap" style={{ marginTop: 4 }}>同意の内容は日時とともに、変更できない記録として保存されます。</span>
        </div>

        <FormMessage state={state} />
      </div>

      {/* TikTok と同じく、下に「下書き」と「投稿」を並べる */}
      <div className="bottom-fixed">
        <button className="btn btn-secondary" name="intent" value="draft" disabled={!canDraft}>下書き保存</button>
        <button className="btn btn-primary" name="intent" value="submit" disabled={!ready}>{pending ? "送信中…" : "審査に提出"}</button>
      </div>

      {coverOpen && up.file && uploadId && (
        <CoverPicker file={up.file} uploadId={uploadId} durationMs={up.info?.durationMs ?? 0}
          onClose={(c) => {
            setCoverOpen(false);
            if (!c?.changed) return;
            // サーバーが作り直した表紙に差し替える（端末で絵を作れなかった場合もこちらで見える）
            up.setCover(c.dataUrl || `/media/${uploadId}/poster.jpg?t=${Date.now()}`);
          }} />
      )}
    </form>
  );
}
