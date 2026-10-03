"use client";
import { useActionState } from "react";
import { applyCreatorAction } from "@/lib/creator-actions";
import { Check, Field, FormMessage } from "@/components/forms/Field";

export function ApplyForm() {
  const [state, action, pending] = useActionState(applyCreatorAction, undefined);
  if (state?.info) return <FormMessage state={state} />;
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="自己紹介" hint="任意・300文字まで" htmlFor="bio"><textarea className="input" id="bio" name="bio" maxLength={300} placeholder="どんな動画を投稿するか" /></Field>
      <div>
        <Check name="adult" required>18歳以上です</Check>
        <Check name="rules" required>投稿ガイドラインを読み、守ります</Check>
      </div>
      <FormMessage state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "送信中…" : "申請する"}</button>
    </form>
  );
}
