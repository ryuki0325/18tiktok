"use client";
import { useState } from "react";
import { testMailAction } from "@/lib/admin-actions";
import { Icon } from "@/components/Icon";

/** 通知メールが本当に届くか、自分宛てに1通送って確かめる */
export function MailCheck() {
  const [r, setR] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
        onClick={async () => { setBusy(true); setR(await testMailAction()); setBusy(false); }}>
        {busy ? "送信中…" : "自分宛てにテスト送信"}
      </button>
      {r && (
        <span className="cap" style={{ display: "inline-flex", gap: 6, alignItems: "center", color: r.ok ? "var(--ok)" : "var(--bad)" }}>
          <Icon name={r.ok ? "check" : "alert"} size={16} />{r.message}
        </span>
      )}
    </div>
  );
}
