"use client";
import { useActionState } from "react";
import { loginAction } from "@/lib/account-actions";
import { Field, FormMessage } from "@/components/forms/Field";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input type="hidden" name="next" value={next} />
      <Field label="メールアドレス" htmlFor="email"><input className="input" id="email" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="パスワード" htmlFor="password"><input className="input" id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <FormMessage state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "確認中…" : "ログイン"}</button>
    </form>
  );
}
