"use client";
import { useActionState } from "react";
import { forgotAction } from "@/lib/account2-actions";
import { Field, FormMessage } from "@/components/forms/Field";

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotAction, undefined);
  if (state?.info) return <FormMessage state={state} />;
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="メールアドレス" htmlFor="email"><input className="input" id="email" name="email" type="email" autoComplete="email" required /></Field>
      <FormMessage state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "送信中…" : "再設定リンクを送る"}</button>
    </form>
  );
}
