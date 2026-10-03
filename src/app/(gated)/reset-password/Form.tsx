"use client";
import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/account2-actions";
import { Field, FormMessage } from "@/components/forms/Field";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input type="hidden" name="token" value={token} />
      <Field label="新しいパスワード" hint="10文字以上" htmlFor="password"><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
      <FormMessage state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "保存中…" : "パスワードを変更する"}</button>
    </form>
  );
}
