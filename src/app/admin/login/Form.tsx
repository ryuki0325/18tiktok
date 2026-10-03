"use client";
import { useActionState } from "react";
import { adminLoginAction } from "@/lib/admin-actions";
import { Field, FormMessage } from "@/components/forms/Field";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminLoginAction, undefined);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="メールアドレス" htmlFor="email"><input className="input" id="email" name="email" type="email" autoComplete="username" required /></Field>
      <Field label="パスワード" htmlFor="password"><input className="input" id="password" name="password" type="password" autoComplete="current-password" required /></Field>
      <FormMessage state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "確認中…" : "次へ（2段階認証）"}</button>
    </form>
  );
}
