"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signupAction } from "@/lib/account-actions";
import { Check, Field, FormMessage } from "@/components/forms/Field";

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, undefined);
  if (state?.info) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <FormMessage state={state} />
      <Link className="btn btn-primary" href="/">フィードへ</Link>
    </div>
  );
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="メールアドレス" htmlFor="email"><input className="input" id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="ユーザー名" hint="半角英数字と _ . で3〜20文字" htmlFor="handle"><input className="input" id="handle" name="handle" autoComplete="username" pattern="[A-Za-z0-9_.]{3,20}" required /></Field>
      <Field label="パスワード" hint="10文字以上" htmlFor="password"><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
      <div>
        <Check name="adult" required>18歳以上です</Check>
        <Check name="terms" required>利用規約とプライバシーポリシーに同意します</Check>
        <p className="cap" style={{ margin: "0 0 0 34px" }}><Link href="/legal/terms" style={{ textDecoration: "underline" }} target="_blank">利用規約</Link>・<Link href="/legal/privacy" style={{ textDecoration: "underline" }} target="_blank">プライバシーポリシー</Link>を読む</p>
      </div>
      <FormMessage state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "登録中…" : "登録する"}</button>
    </form>
  );
}
