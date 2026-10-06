"use client";
import { useActionState } from "react";
import { addAffiliateAction } from "@/lib/creator-actions";
import { FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";

/** アフィリエイトを1つ足す（登録済みのものは変えられない） */
export function AffiliateForm({ destinations }: { destinations: { id: string; serviceName: string; domain: string }[] }) {
  const [state, action, pending] = useActionState(addAffiliateAction, undefined);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="label">サービスを追加</span>
      <div className="aff-row">
        <select className="input" name="destinationId" required aria-label="アフィリエイトサイト名">
          {destinations.map((d) => <option key={d.id} value={d.id}>{d.serviceName}</option>)}
        </select>
        <input className="input num" name="affiliateId" required maxLength={64} placeholder="アフィリエイトID" aria-label="アフィリエイトID" />
      </div>
      <FormMessage state={state} />
      <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} disabled={pending}>
        <Icon name="plus" size={16} />{pending ? "追加中…" : "追加する"}
      </button>
    </form>
  );
}
