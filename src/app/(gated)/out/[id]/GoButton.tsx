"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { api } from "@/components/feed/api";
import { useToast } from "@/components/Toast";

export function GoButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const go = async () => {
    setBusy(true);
    const r = await api<{ url: string }>(`/api/v1/out/${id}`, { method: "POST", body: {} });
    setBusy(false);
    if (!r.ok) { toast(r.data.error?.message ?? "移動できませんでした"); return; }
    const a = document.createElement("a");
    a.href = r.data.url; a.rel = "noopener noreferrer"; a.target = "_blank";
    a.referrerPolicy = "no-referrer";
    a.click();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
      <button className="cta" onClick={go} disabled={busy}>{busy ? "確認中…" : <>移動する <Icon name="ext" size={18} stroke={2.2} /></>}</button>
      <button className="btn btn-outline pill" style={{ height: 52 }} onClick={() => (history.length > 1 ? router.back() : router.push("/"))}>戻る</button>
    </div>
  );
}
