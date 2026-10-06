"use client";
import { useActionState } from "react";
import { createCollectionAction } from "@/lib/social-actions";
import { FormMessage } from "@/components/forms/Field";
import { Icon } from "@/components/Icon";

export function NewCollection() {
  const [state, action, pending] = useActionState(createCollectionAction, undefined);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="label">新しいコレクション</span>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="input" name="name" maxLength={40} required placeholder="例：お気に入り、あとで見る" aria-label="コレクション名" style={{ height: 44 }} />
        <button className="btn btn-primary" style={{ width: "auto", padding: "0 18px" }} disabled={pending}><Icon name="plus" size={16} />作成</button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
