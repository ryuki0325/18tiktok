"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { applyCreatorAction } from "@/lib/creator-actions";
import { Check, Field, FormMessage } from "@/components/forms/Field";

/**
 * 投稿者の申請。
 * 年齢は生年月日で確認する。入力した生年月日は運営の権限者だけが見られ、
 * 保存期限を過ぎたら自動で消える（「確認済み」という結果だけが残る）。
 */
export function ApplyForm({ minAge, methodNote, maxDate, destinations }: {
  minAge: number; methodNote: string; maxDate: string;
  destinations: { id: string; serviceName: string; domain: string }[];
}) {
  const [state, action, pending] = useActionState(applyCreatorAction, undefined);
  const [dest, setDest] = useState(destinations[0]?.id ?? "");
  if (state?.info) return <FormMessage state={state} />;
  const max = maxDate;
  const picked = destinations.find((d) => d.id === dest);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="生年月日" hint={`${minAge}歳以上の方のみ`} htmlFor="birthDate">
        <input className="input num" id="birthDate" name="birthDate" type="date" max={max} min="1920-01-01" required
          style={{ height: 46 }} autoComplete="bday" />
        <span className="cap">{methodNote}</span>
      </Field>
      <Field label="自分の販売ページ（アフィリエイトURL）" hint="必須" htmlFor="affiliateUrl">
        <select className="input" value={dest} onChange={(e) => setDest(e.target.value)} style={{ height: 46, marginBottom: 8 }} aria-label="送客先のサービス">
          {destinations.map((d) => <option key={d.id} value={d.id}>{d.serviceName}（{d.domain}）</option>)}
        </select>
        <input className="input" id="affiliateUrl" name="affiliateUrl" type="url" required inputMode="url"
          placeholder={picked ? `https://${picked.domain}/...` : "https://..."} style={{ height: 46 }} />
        <span className="cap">
          投稿した動画から「完全版を見る」で案内する先です。<b>自分の作品を売っているページのURL</b>を貼ってください。
          短縮URLや転送サービスは使えません。
        </span>
      </Field>
      <Field label="自己紹介" hint="任意・300文字まで" htmlFor="bio">
        <textarea className="input" id="bio" name="bio" maxLength={300} placeholder="どんな動画を投稿するか" />
      </Field>
      <div>
        <Check name="rights" required>投稿する動画は自分が権利を持ち、出演者全員が18歳以上で公開に同意しています</Check>
        <Check name="sample" required>投稿するのは、上の販売ページで売っている作品のサンプル動画です</Check>
        <Check name="rules" required>投稿ガイドラインを読み、守ります</Check>
      </div>
      <span className="cap">
        申請すると、生年月日・申請日時が運営の記録として保存されます。くわしくは
        <Link href="/legal/privacy" style={{ color: "var(--accent)" }}>プライバシーポリシー</Link>をご覧ください。
      </span>
      <FormMessage state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "送信中…" : "申請する"}</button>
    </form>
  );
}
