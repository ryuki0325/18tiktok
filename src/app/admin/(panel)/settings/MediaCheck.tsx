"use client";
import { useState } from "react";
import { checkBunnyAction } from "@/lib/admin-actions";
import { Icon } from "@/components/Icon";

/** 動画の保存先（Bunny Stream）につながるか、その場で確かめる */
export function MediaCheck() {
  const [r, setR] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
        onClick={async () => { setBusy(true); setR(await checkBunnyAction()); setBusy(false); }}>
        {busy ? "確認中…" : "接続を確認する"}
      </button>
      {r && (
        <span className="cap" style={{ display: "inline-flex", gap: 6, alignItems: "center", color: r.ok ? "var(--ok)" : "var(--bad)" }}>
          <Icon name={r.ok ? "check" : "alert"} size={16} />{r.message}
        </span>
      )}
    </div>
  );
}
