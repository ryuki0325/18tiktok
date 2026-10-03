"use client";
import { useActionState, useRef, useState } from "react";
import { updateProfileAction } from "@/lib/profile-actions";
import { Field, FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

type U = { handle: string; displayName: string; bio: string; avatarHue: number; avatarUrl: string | null };

/** アバターの色の候補（テーマに合う色相） */
const HUES = [280, 320, 350, 15, 38, 60, 150, 190, 215, 250];

/** 写真は端末の中で 128×128 の JPEG に縮めてから送る（通信も保存も軽くするため） */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("読み込めません"));
      i.src = url;
    });
    const S = 128;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const g = c.getContext("2d")!;
    // 真ん中を正方形に切り取る
    const side = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const d = c.toDataURL("image/jpeg", q);
      if (d.length <= 40_000) return d;
    }
    throw new Error("too big");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function EditProfileForm({ u }: { u: U }) {
  const [state, action, pending] = useActionState(updateProfileAction, undefined);
  const [avatar, setAvatar] = useState<string | null>(u.avatarUrl);
  const [hue, setHue] = useState(u.avatarHue);
  const [bio, setBio] = useState(u.bio);
  const [err, setErr] = useState<string | null>(null);
  // 写真を触っていないときは空で送り、サーバー側では今のままにする
  const [avatarField, setAvatarField] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (!f.type.startsWith("image/")) { setErr("画像ファイルを選んでください"); return; }
    try { const d = await shrink(f); setAvatar(d); setAvatarField(d); } catch { setErr("この画像は使えません。別の写真でお試しください"); }
  };

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="sec" style={{ gap: 20, paddingBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <button type="button" className="av-edit" onClick={() => file.current?.click()} aria-label="プロフィール写真を変える">
            <ProfileAvatar hue={hue} url={avatar} size={104} />
            <span className="cam"><Icon name="camera" size={18} /></span>
          </button>
          <input ref={file} type="file" accept="image/*" hidden aria-label="プロフィール写真" onChange={(e) => void pick(e.target.files?.[0])} />
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" className="cap" style={{ color: "var(--accent)" }} onClick={() => file.current?.click()}>写真を選ぶ</button>
            {avatar && <button type="button" className="cap" style={{ color: "var(--bad)" }} onClick={() => { setAvatar(null); setAvatarField("remove"); }}>写真を外す</button>}
          </div>
          {err && <span className="cap" style={{ color: "var(--bad)" }}>{err}</span>}
          <input type="hidden" name="avatar" value={avatarField} />
        </div>

        {!avatar && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="label">アイコンの色<small>写真がないときに使われます</small></span>
            <div className="hues">
              {HUES.map((h) => (
                <button type="button" key={h} aria-label={`色 ${h}`} aria-pressed={hue === h} onClick={() => setHue(h)}
                  style={{ background: `linear-gradient(135deg, hsl(${h} 55% 55%), hsl(${(h + 40) % 360} 60% 35%))` }} />
              ))}
            </div>
          </div>
        )}
        <input type="hidden" name="avatarHue" value={hue} />

        <Field label="ユーザー名" hint="半角の英小文字・数字・. _ ／3〜20文字" htmlFor="handle">
          <div className="at-input"><span>@</span><input className="input" id="handle" name="handle" defaultValue={u.handle} maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></div>
          <span className="cap">変えると、これまでのリンク（/u/{u.handle}）は開けなくなります。</span>
        </Field>
        <Field label="表示名" hint="30文字まで" htmlFor="displayName">
          <input className="input" id="displayName" name="displayName" defaultValue={u.displayName} maxLength={30} required />
        </Field>
        <Field label="自己紹介" hint={`160文字まで（${bio.length}/160）`} htmlFor="bio">
          <textarea className="input" id="bio" name="bio" maxLength={160} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="どんな動画を出しているか、ひとこと" />
          <span className="cap">URL・連絡先・年齢を思わせる表現は書かないでください。見つけた場合は削除します。</span>
        </Field>
        <FormMessage state={state} />
      </div>
      <div className="bottom-fixed"><button className="btn btn-primary" disabled={pending}>{pending ? "保存中…" : "保存する"}</button></div>
    </form>
  );
}
