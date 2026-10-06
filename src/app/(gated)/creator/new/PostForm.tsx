"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { createVideoAction } from "@/lib/creator-actions";
import { Check, FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";
import { CoverPicker } from "@/components/upload/CoverPicker";
import { TrimBar } from "@/components/upload/TrimBar";
import { TagInput } from "@/components/upload/TagInput";
import { useUpload } from "@/components/upload/useUpload";
import { usePhotos } from "@/components/upload/usePhotos";
import { findUnfinished, forgetUnfinished, type Unfinished } from "@/components/upload/tus";
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
type Resume = {
  id: string; caption: string; tags: string[]; category: string | null; intensity: number | null;
  visibility: "public" | "private"; comments: boolean; poster: string | null; hasMedia: boolean;
  destId: string; linkUrl: string;
  kind: "video" | "photo"; images: { url: string; w: number; h: number }[] | null;
};

export function PostForm({ tags, destinations, upload, drafts, resume, myLink }: {
  tags: string[]; destinations: Dest[]; upload: { maxMb: number; maxSec: number; canTrim: boolean; maxImages: number } | null; drafts: Draft[];
  /** 下書きの続きから書くとき、その中身 */
  resume?: Resume | null;
  /** 申請のときに登録した自分の販売ページ（初期値に使う） */
  myLink?: { destId: string; url: string } | null;
}) {
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [state, action, pending] = useActionState(createVideoAction, undefined);
  const up = useUpload({ maxMb: upload?.maxMb ?? 0, maxSec: upload?.maxSec ?? 0, onReady: setUploadId });
  const input = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState(resume?.caption ?? "");
  const [sel, setSel] = useState<string[]>(resume?.tags ?? []);
  const [cat, setCat] = useState<string | null>(resume?.category ?? null);
  const [lv, setLv] = useState<number | null>(resume?.intensity ?? null);
  const [visibility, setVisibility] = useState<"public" | "private">(resume?.visibility ?? "public");
  const [comments, setComments] = useState(resume?.comments ?? true);
  const [destId, setDestId] = useState(resume?.destId ?? myLink?.destId ?? "");
  const [linkUrl, setLinkUrl] = useState(resume?.linkUrl ?? myLink?.url ?? "");
  const [checks, setChecks] = useState({ c1: false, c2: false, c3: false });
  const [coverOpen, setCoverOpen] = useState(false);
  // 下書きの続きは、動画がもう付いているので最初から内容を書く画面に入る
  const kept = !!resume?.hasMedia;
  // 前に送りかけた動画。もう一度同じファイルを選べば、続きから送れる
  const [left, setLeft] = useState<Unfinished | null>(null);
  useEffect(() => {
    if (!upload) return;
    let dead = false;
    void findUnfinished().then((u) => { if (!dead) setLeft(u); });
    return () => { dead = true; };
  }, [upload]);
  // 投稿画面を開いたら、すぐ端末の選択画面を出す（iOS では1タップ必要なことがある）
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !upload || resume?.hasMedia) return;
    opened.current = true;
    const t = setTimeout(() => input.current?.click(), 150);
    return () => clearTimeout(t);
  }, [upload, resume]);
  const canTrim = !!upload?.canTrim;
  const [trimOpen, setTrimOpen] = useState(false);
  const [trim, setTrim] = useState<{ startMs: number; endMs: number } | null>(null);

  // 写真投稿（複数枚）。動画が選ばれていなければこちら
  const [images, setImages] = useState<{ url: string; w: number; h: number }[]>([]);
  const ph = usePhotos({ max: upload?.maxImages ?? 0, onChange: setImages, initial: resume?.kind === "photo" ? resume.images : null });
  const photoInput = useRef<HTMLInputElement>(null);
  const isPhoto = resume?.kind === "photo" || (ph.photos.length > 0 && !up.file && !kept);

  // 「動画を選ぶ」ボタンから、動画と写真のどちらが来ても振り分ける
  const pickFiles = (files: FileList | null) => {
    const arr = files ? Array.from(files) : [];
    if (!arr.length) return;
    const vid = arr.find((f) => f.type.startsWith("video/"));
    if (vid) void up.pick(vid);
    else void ph.add(arr);
  };

  // 保存先が未設定のときは、動画なしで先に内容だけ登録できる（運営が設定するまでの間）
  // 下書きの続きは、動画がもう付いているので最初から内容を書く画面に入る
  const chosen = !upload || !!up.file || kept || ph.photos.length > 0;
  // 動画は変換完了、写真は1枚以上アップロード済みで「本体あり」とみなす
  const hasVideo = !upload ? true
    : isPhoto ? (ph.readyCount > 0 && !ph.uploading)
    : (!!uploadId || kept);
  // 「完全版を見る」のリンクは必須（サンプル動画として投稿してもらうため）
  const ready = hasVideo && !!cat && !!lv && caption.trim().length > 0 && sel.length > 0
    && !!destId && linkUrl.trim().length > 0
    && checks.c1 && checks.c2 && checks.c3 && !pending;
  // 下書きは、動画さえ送れていれば保存できる
  const canDraft = hasVideo && !pending;

  const toggleTag = (t: string) =>
    setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : s.length < MAX_TAGS ? [...s, t] : s));

  /* ---------- 1) 動画・写真を選ぶ画面（開くとすぐ端末の選択が出る） ---------- */
  if (!chosen) {
    return (
      <div className="pick-screen">
        <input ref={input} type="file" accept="video/*,image/*" multiple hidden aria-label="動画・写真を選ぶ"
          onChange={(e) => pickFiles(e.target.files)} />
        <button type="button" className="pick-main" onClick={() => input.current?.click()}>
          <span className="ic"><Icon name="upload" size={34} /></span>
          <b>動画・写真を選ぶ</b>
          <span className="cap">
            縦長がおすすめ（横長もそのまま表示されます）<br />
            {upload && <>動画は1本（{Math.floor(upload.maxSec / 60)}分・{upload.maxMb >= 1024 ? `${upload.maxMb / 1024}GB` : `${upload.maxMb}MB`}まで）／写真は何枚でも</>}
          </span>
        </button>
        {left && up.state.k === "idle" && (
          <div className="notice info resume" role="status">
            <Icon name="upload" size={18} />
            <span>
              <b>送りかけの動画があります</b><br />
              {left.filename}（{Math.floor((left.sent / Math.max(1, left.size)) * 100)}% まで送信済み）<br />
              <small>同じファイルをもう一度選ぶと、続きから送ります。</small>
            </span>
            <span style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => input.current?.click()}>続きから送る</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => { forgetUnfinished(); setLeft(null); }}>やめる</button>
            </span>
          </div>
        )}
        {up.state.k === "failed" && <p className="cap" style={{ color: "var(--bad)", textAlign: "center" }}>{up.state.message}</p>}
        {up.state.k === "reading" && <p className="cap" style={{ textAlign: "center" }}>動画を読み込んでいます…</p>}

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

        <p className="cap" style={{ textAlign: "center", maxWidth: 320, lineHeight: 1.7 }}>
          投稿できるのは、<b>自分が権利を持ち、出演者全員が18歳以上で公開に同意している動画</b>だけです。
          <Link href="/legal/guidelines" style={{ color: "var(--accent)" }}>投稿ガイドライン</Link>を必ずお読みください。
        </p>
      </div>
    );
  }

  /* ---------- 2) 投稿の内容を決める画面 ---------- */
  const st = up.state;
  // 下書きの続きのときは、保存してある表紙を出す（手元に動画ファイルはない）
  const coverSrc = up.cover ?? (kept ? resume!.poster : null);
  const statusLine = isPhoto
    ? (ph.uploading ? "写真を取り込み中です…" : `写真 ${ph.readyCount} 枚の準備ができました`)
    : st.k === "uploading" ? `アップロード中 ${up.pct}%（${mb(st.sent)} / ${mb(st.total)}）`
      : st.k === "paused" ? `一時停止中 ${up.pct}%`
        : st.k === "processing" ? "画質ごとに変換中です（このまま投稿できます）"
          : st.k === "ready" ? "動画の準備ができました"
            : st.k === "failed" ? st.message
              : kept ? "下書きの続きです" : "";

  return (
    <form action={action} className="composer">
      <input type="hidden" name="uploadId" value={uploadId ?? ""} />
      <input type="hidden" name="kind" value={isPhoto ? "photo" : "video"} />
      {isPhoto && <input type="hidden" name="images" value={JSON.stringify(images)} />}
      {resume && <input type="hidden" name="draftId" value={resume.id} />}
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
          <div className="up-bar"><i style={{ transform: `scaleX(${isPhoto ? (ph.uploading ? 0.5 : 1) : up.pct / 100})` }} /></div>
          <div className="up-row">
            <span className="cap num">{statusLine}</span>
            {!isPhoto && st.k === "uploading" && <button type="button" className="btn btn-sm btn-secondary" onClick={up.pause}>一時停止</button>}
            {!isPhoto && st.k === "paused" && <button type="button" className="btn btn-sm btn-primary" onClick={() => void up.resume()}>再開</button>}
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

        {/* 写真投稿のときは、選んだ写真を横に並べて足したり外したりできる */}
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
            {ph.photos.length < (upload?.maxImages ?? 0) && (
              <button type="button" className="photo-add" onClick={() => photoInput.current?.click()} aria-label="写真を追加">
                <Icon name="plus" size={24} /><span>追加</span>
              </button>
            )}
            <input ref={photoInput} type="file" accept="image/*" multiple hidden aria-label="写真を追加する"
              onChange={(e) => { void ph.add(e.target.files ? Array.from(e.target.files) : []); e.currentTarget.value = ""; }} />
          </div>
        )}

        {/* 説明＋表紙（TikTok と同じ並び） */}
        <div className="cap-row">
          <textarea className="cap-input" value={caption} onChange={(e) => setCaption(e.target.value)}
            maxLength={300} rows={5} placeholder="説明を書く…　#タグ をつけると見つけてもらいやすくなります" aria-label="説明" />
          {upload && !isPhoto && (
            <button type="button" className="cover-btn" onClick={() => setCoverOpen(true)} disabled={!up.file || st.k !== "ready"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {coverSrc ? <img src={coverSrc} alt="" /> : <span className="ph"><Icon name="video" size={22} /></span>}
              <span className="lbl">{kept && !up.file ? "動画は保存済み" : st.k === "ready" ? "表紙を選ぶ" : "準備中…"}</span>
            </button>
          )}
        </div>
        <div className="cap-meta">
          <span className="cap num">{caption.length}/300</span>
          <button type="button" className="cap-chip" onClick={() => setCaption((c) => `${c}#`)}>#タグを入れる</button>
          {canTrim && up.file && !isPhoto && (
            <button type="button" className="cap-chip" onClick={() => setTrimOpen(true)} disabled={st.k === "uploading" || st.k === "reading"}>
              <Icon name="scissors" size={14} />{trim ? `${Math.round((trim.endMs - trim.startMs) / 1000)}秒に切り取り済み` : "長さを切り取る"}
            </button>
          )}
          {upload && (
            <button type="button" className="cap-chip" onClick={() => { up.reset(); ph.reset(); }}>
              {isPhoto ? "選び直す" : "動画を選び直す"}
            </button>
          )}
        </div>

        {/* タグ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">タグ<small>必須・最大{MAX_TAGS}つ（{sel.length}/{MAX_TAGS}）</small></span>
          <TagInput all={tags} value={sel} max={MAX_TAGS} onChange={setSel} />
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
          <span className="label">「完全版を見る」のリンク<small>必須</small></span>
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
                  <span className="cap" style={{ display: "flex", gap: 6 }}>
                    <Icon name="shield" size={14} />
                    この動画は<b>サンプル</b>として扱われます。完全版を売っている自分のページのURLを入れてください。
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

      {trimOpen && up.file && uploadId && (
        <TrimBar file={up.file} uploadId={uploadId} durationMs={up.info?.durationMs ?? 0} value={trim}
          onClose={(v, saved) => {
            setTrimOpen(false);
            if (!saved) return;
            setTrim(v);
            // 切り取ると変換をやり直すので、終わるまで待つ
            up.recheck();
          }} />
      )}
    </form>
  );
}
