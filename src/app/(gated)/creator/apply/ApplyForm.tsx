"use client";
import Link from "next/link";
import { useActionState } from "react";
import { applyCreatorAction } from "@/lib/creator-actions";
import { Check, Field, FormMessage } from "@/components/forms/Field";

/**
 * 投稿者の申請。
 * 年齢は生年月日で確認する。入力した生年月日は運営の権限者だけが見られ、
 * 保存期限を過ぎたら自動で消える（「確認済み」という結果だけが残る）。
 */
export function ApplyForm({ minAge, methodNote, maxDate }: { minAge: number; methodNote: string; maxDate: string }) {
  const [state, action, pending] = useActionState(applyCreatorAction, undefined);
  if (state?.info) return <FormMessage state={state} />;
  const max = maxDate;
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="生年月日" hint={`${minAge}歳以上の方のみ`} htmlFor="birthDate">
        <input className="input num" id="birthDate" name="birthDate" type="date" max={max} min="1920-01-01" required
          style={{ height: 46 }} autoComplete="bday" />
        <span className="cap">{methodNote}</span>
      </Field>
      <Field label="自己紹介" hint="任意・300文字まで" htmlFor="bio">
        <textarea className="input" id="bio" name="bio" maxLength={300} placeholder="どんな動画を投稿するか" />
      </Field>
      <div>
        <Check name="rights" required>投稿する動画は自分が権利を持ち、出演者全員が18歳以上で公開に同意しています</Check>
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
