"use client";
import { useActionState } from "react";
import { resendVerifyAction } from "@/lib/account-actions";
import { FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";

export function ResendVerify() {
  const [state, action, pending] = useActionState(resendVerifyAction, undefined);
  return (
    <form action={action} className="notice warn" style={{ flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 10 }}><Icon name="mail" size={18} /><span>メールアドレスが未確認です。コメントや、お知らせメールの受け取りには確認が必要です。</span></div>
      <FormMessage state={state} />
      {!state?.info && <button className="btn btn-sm btn-secondary" disabled={pending}>確認メールを再送する</button>}
    </form>
  );
}
