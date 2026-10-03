"use client";
import { useActionState } from "react";
import { acceptAgeGate, declineAgeGate } from "@/lib/agegate-actions";

export function GateForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(acceptAgeGate, undefined);
  return (
    <form action={action} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="next" value={next} />
      <button className="cta" type="submit" disabled={pending}>{pending ? "確認中…" : "はい、18歳以上です"}</button>
      <button className="btn btn-outline pill" style={{ height: 52 }} formAction={declineAgeGate} disabled={pending}>いいえ、退出する</button>
      {state?.error && <div className="notice bad" role="alert" style={{ textAlign: "left" }}>{state.error}</div>}
    </form>
  );
}
