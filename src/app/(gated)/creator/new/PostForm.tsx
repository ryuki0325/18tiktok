"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { createVideoAction } from "@/lib/creator-actions";
import { Check, FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";
import { TagInput } from "@/components/upload/TagInput";
import { usePhotos } from "@/components/upload/usePhotos";
import { VIDEO_CATEGORIES } from "@/lib/audience";

type Dest = { id: string; serviceName: string; domain: string };
type Draft = { id: string; title: string; poster: string | null; hue: [number, number, number] };

const MAX_TAGS = 5;

/**
 * 投稿画面。
 * 動画は自社に保存せず、公式サンプル等の「埋め込みURL」で表示する（出どころは運営の許可リストに限定）。
 * 写真は、権利を持つ自分の宣伝用素材をアップロードできる。
 */
type Resume = {
  id: string; caption: string; tags: string[]; category: string | null; intensity: number | null;
  visibility: "public" | "private"; comments: boolean; poster: string | null; hasMedia: boolean;
  destId: string; linkUrl: string; embedUrl: string;
  kind: "video" | "photo"; images: { url: string; w: number; h: number }[] | null;
};

export function PostForm({ tags, destinations, drafts, resume, maxImages, myLink }: {
  tags: string[]; destinations: Dest[]; drafts: Draft[]; maxImages: number;
  resume?: Resume | null;
  myLink?: { destId: string; url: string } | null;
}) {
  const [state, action, pending] = useActionState(createVideoAction, undefined);

  // 投稿の種類。新規は未選択の入口を出し、下書きの続きは保存されている種類で始める。
  const [mode, setMode] = useState<"video" | "photo" | null>(resume?.kind ?? null);

  const [caption, setCaption] = useState(resume?.caption ?? "");
  const [sel, setSel] = useState<string[]>(resume?.tags ?? []);
  const [cat, setCat] = useState<string | null>(resume?.category ?? null);
  const [visibility, setVisibility] = useState<"public" | "private">(resume?.visibility ?? "public");
  const [comments, setComments] = useState(resume?.comments ?? true);
  const [destId, setDestId] = useState(resume?.destId ?? myLink?.destId ?? "");
  const [linkUrl, setLinkUrl] = useState(resume?.linkUrl ?? myLink?.url ?? "");
  const [embed, setEmbed] = useState(resume?.embedUrl ?? "");
  const [checks, setChecks] = useState({ c1: false, c2: false, c3: false, c4: false });

  // 写真投稿（複数枚）
  const [images, setImages] = useState<{ url: string; w: number; h: number }[]>([]);
  const ph = usePhotos({ max: maxImages, onChange: setImages, initial: resume?.kind === "photo" ? resume.images : null });
  const photoInput = useRef<HTMLInputElement>(null);
  const isPhoto = mode === "photo";

  const hasMedia = isPhoto ? (ph.readyCount > 0 && !ph.uploading) : embed.trim().length > 0;
  const ready = hasMedia && !!cat && caption.trim().length > 0 && sel.length > 0
    && !!destId && linkUrl.trim().length > 0
    && checks.c1 && checks.c2 && checks.c3 && checks.c4 && !pending;
  const canDraft = hasMedia && !pending;

  const missing = [
    !hasMedia && (isPhoto ? "写真を選ぶ" : "埋め込みURLを入れる"),
    !cat && "ジャンルを選ぶ",
    caption.trim().length === 0 && "説明を書く",
    sel.length === 0 && "タグを1つ以上つける",
    (!destId || linkUrl.trim().length === 0) && "「完全版を見る」のリンクを入れる",
    !(checks.c1 && checks.c2 && checks.c3 && checks.c4) && "確認事項にすべてチェックする",
  ].filter(Boolean) as string[];

  /* ---------- 1) 種類を選ぶ画面 ---------- */
  if (mode === null) {
    return (
      <div className="pick-screen">
        <div className="pick-choices">
          <button type="button" className="pick-main" onClick={() => setMode("video")}>
            <span className="pick-glow" aria-hidden="true" />
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
      {!isPhoto && <input type="hidden" name="embed" value={embed.trim()} />}
      {resume && <input type="hidden" name="draftId" value={resume.id} />}
      <input type="hidden" name="visibility" value={visibility} />
      <input type="hidden" name="commentsEnabled" value={comments ? "on" : "off"} />
      {cat && <input type="hidden" name="category" value={cat} />}
      {sel.map((t) => <input key={t} type="hidden" name="tags" value={t} />)}
      <input type="hidden" name="title" value={caption.split("\n")[0].slice(0, 60)} />
      <input type="hidden" name="description" value={caption.slice(0, 300)} />
      <input type="hidden" name="link" value={destId ? linkUrl : ""} />

      <div className="sec" style={{ gap: 18, paddingBottom: 16 }}>
        {/* 動画＝埋め込みURL */}
        {!isPhoto && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="label">埋め込みURL<small className="req">必須</small></span>
            <input className="input num" type="url" inputMode="url" value={embed} onChange={(e) => setEmbed(e.target.value)}
              placeholder="https://…（動画の埋め込みURL）" aria-label="埋め込みURL" style={{ height: 46 }} />
            <span className="cap" style={{ display: "flex", gap: 6 }}>
              <Icon name="shield" size={14} />
              動画は<b>自社に保存しません</b>。権利を持つ素材・正規流通作品の公式サンプルの埋め込みURLを入れてください。
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

        {/* タグ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="label">タグ<small className="req">必須</small><small>・最大{MAX_TAGS}つ（{sel.length}/{MAX_TAGS}）</small></span>
          <TagInput value={sel} max={MAX_TAGS} onChange={setSel} />
        </div>

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
                  <span className="cap" style={{ display: "flex", gap: 6 }}>
                    <Icon name="shield" size={14} />
                    この投稿は<b>サンプル</b>として扱われます。完全版を売っている自分のページのURLを入れてください。
                    選んだサービスのURLだけ登録できます。短縮URLは使えません。移動の前に確認画面とPR表記が出ます。
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
    </form>
  );
}
