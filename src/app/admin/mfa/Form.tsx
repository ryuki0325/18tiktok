"use client";
import { useActionState } from "react";
import { mfaVerifyAction } from "@/lib/admin-actions";
import { FormMessage } from "@/components/forms/Field";

export function MfaForm() {
  const [state, action, pending] = useActionState(mfaVerifyAction, undefined);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input className="input num" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" placeholder="123456" required aria-label="6桁のコード" style={{ fontSize: 22, textAlign: "center", letterSpacing: ".3em" }} />
      <FormMessage state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "確認中…" : "確認"}</button>
    </form>
  );
}
