"use client";
import { useActionState, useState } from "react";
import { changePasswordAction, deleteAccountAction } from "@/lib/account2-actions";
import { Field, FormMessage } from "@/components/forms/Field";

export function AccountForms() {
  const [pwState, pwAction, pwPending] = useActionState(changePasswordAction, undefined);
  const [delState, delAction, delPending] = useActionState(deleteAccountAction, undefined);
  const [open, setOpen] = useState(false);
  return (
    <>
      <form action={pwAction} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <b>パスワードの変更</b>
        <Field label="今のパスワード" htmlFor="current"><input className="input" id="current" name="current" type="password" autoComplete="current-password" required /></Field>
        <Field label="新しいパスワード" hint="10文字以上" htmlFor="next"><input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={10} required /></Field>
        <FormMessage state={pwState} />
        <button className="btn btn-secondary" disabled={pwPending}>{pwPending ? "保存中…" : "変更する"}</button>
      </form>
      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ color: "var(--bad)" }}>退会</b>
        <p className="cap" style={{ margin: 0, lineHeight: 1.7 }}>アカウント・お気に入り・フォロー・コメント・投稿した動画が削除され、元に戻せません。投稿時の同意記録など、法令で保存が必要な記録は一定期間残ります。</p>
        {!open ? <button className="btn btn-danger" onClick={() => setOpen(true)}>退会の手続きへ</button> : (
          <form action={delAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="パスワード" htmlFor="delpw"><input className="input" id="delpw" name="password" type="password" autoComplete="current-password" required /></Field>
            <Field label="確認のため「退会する」と入力" htmlFor="confirm"><input className="input" id="confirm" name="confirm" required /></Field>
            <FormMessage state={delState} />
            <button className="btn btn-danger" disabled={delPending}>{delPending ? "処理中…" : "退会する"}</button>
          </form>
        )}
      </div>
    </>
  );
}
