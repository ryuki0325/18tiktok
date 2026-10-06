"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { applyCreatorAction } from "@/lib/creator-actions";
import { Field, FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";

type Dest = { id: string; serviceName: string; domain: string };
type Row = { destinationId: string; affiliateId: string };

/**
 * 投稿者の登録。
 * 運営の承認を置かない代わりに、確認事項は1つも省けないようにしてある。
 * 同意した内容は、あとから書き換えられない形で記録される。
 */
export function ApplyForm({ minAge, methodNote, maxDate, destinations, attestations }: {
  minAge: number; methodNote: string; maxDate: string; destinations: Dest[];
  attestations: { key: string; text: string }[];
}) {
  const [state, action, pending] = useActionState(applyCreatorAction, undefined);
  const [rows, setRows] = useState<Row[]>([{ destinationId: destinations[0]?.id ?? "", affiliateId: "" }]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  if (state?.info) return <FormMessage state={state} />;

  const allChecked = attestations.every((a) => checks[a.key]);
  const set = (i: number, v: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...v } : x)));

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Field label="生年月日" hint={`${minAge}歳以上の方のみ`} htmlFor="birthDate">
        <input className="input num" id="birthDate" name="birthDate" type="date" max={maxDate} min="1920-01-01" required
          style={{ height: 46 }} autoComplete="bday" />
        <span className="cap">{methodNote}</span>
      </Field>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="label">アフィリエイトの登録<small>1つ以上・あとから追加できます</small></span>
        {rows.map((r, i) => (
          <div key={i} className="aff-row">
            <select className="input" name="destinationId" value={r.destinationId} required
              onChange={(e) => set(i, { destinationId: e.target.value })} aria-label={`アフィリエイトサイト名 ${i + 1}`}>
              {destinations.map((d) => <option key={d.id} value={d.id}>{d.serviceName}</option>)}
            </select>
            <input className="input num" name="affiliateId" value={r.affiliateId} required maxLength={64}
              onChange={(e) => set(i, { affiliateId: e.target.value })}
              placeholder="アフィリエイトID" aria-label={`アフィリエイトID ${i + 1}`} />
            {rows.length > 1 && (
              <button type="button" className="iconbtn" aria-label={`${i + 1}行目を消す`}
                onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Icon name="x" size={18} /></button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-sm btn-secondary" style={{ alignSelf: "flex-start" }}
          onClick={() => setRows((x) => [...x, { destinationId: destinations[0]?.id ?? "", affiliateId: "" }])}>
          <Icon name="plus" size={16} />サービスを追加
        </button>
        <span className="cap">
          <b>登録したあとは、ご自身では変更・削除できません。</b>入力まちがいにご注意ください。
          変更が必要な場合は<Link href="/legal/operator" style={{ color: "var(--accent)" }}>運営への問い合わせ</Link>からご連絡ください。
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="label">確認事項<small>すべて必須</small></span>
        <p className="cap" style={{ margin: "2px 0 8px" }}>
          チェックした内容と日時は、変更できない記録として保存されます。
        </p>
        {attestations.map((a) => (
          <label key={a.key} className="check">
            <input type="checkbox" name={`at.${a.key}`} checked={!!checks[a.key]} required
              onChange={(e) => setChecks((c) => ({ ...c, [a.key]: e.target.checked }))} />
            <span className="box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
            <span>{a.text}</span>
          </label>
        ))}
      </div>

      <span className="cap">
        生年月日・登録したアフィリエイトID・同意の記録が保存されます。くわしくは
        <Link href="/legal/privacy" style={{ color: "var(--accent)" }}>プライバシーポリシー</Link>と
        <Link href="/legal/guidelines" style={{ color: "var(--accent)" }}>投稿ガイドライン</Link>をご覧ください。
      </span>
      <FormMessage state={state} />
      <button className="btn btn-primary" disabled={pending || !allChecked}>
        {pending ? "登録中…" : "登録して投稿をはじめる"}
      </button>
    </form>
  );
}
