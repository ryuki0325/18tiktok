"use client";
import { useActionState } from "react";
import { takedownAction } from "@/lib/takedown-actions";
import { Check, Field, FormMessage } from "@/components/forms/Field";

export function TakedownForm() {
  const [state, action, pending] = useActionState(takedownAction, undefined);
  if (state?.info) return <FormMessage state={state} />;
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="お名前" htmlFor="name"><input className="input" id="name" name="name" required maxLength={100} /></Field>
      <Field label="メールアドレス" hint="回答の送り先" htmlFor="email"><input className="input" id="email" name="email" type="email" required /></Field>
      <Field label="申告者" htmlFor="requesterType"><select className="input" id="requesterType" name="requesterType">{["本人", "権利者", "代理人", "その他"].map((o) => <option key={o}>{o}</option>)}</select></Field>
      <Field label="申告の種類" htmlFor="claimType"><select className="input" id="claimType" name="claimType">{["著作権", "肖像権・プライバシー", "出演同意の取消し", "名誉毀損", "未成年の疑い", "その他"].map((o) => <option key={o}>{o}</option>)}</select></Field>
      <Field label="対象のURL" hint="動画のシェアリンクなど" htmlFor="targetUrl"><input className="input" id="targetUrl" name="targetUrl" required maxLength={500} /></Field>
      <Field label="詳しい内容" htmlFor="detail"><textarea className="input" id="detail" name="detail" required minLength={10} maxLength={4000} style={{ height: 140 }} /></Field>
      <Check name="truth" required>申告内容は正確であり、虚偽の申告ではありません</Check>
      <FormMessage state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "送信中…" : "申告する"}</button>
    </form>
  );
}
