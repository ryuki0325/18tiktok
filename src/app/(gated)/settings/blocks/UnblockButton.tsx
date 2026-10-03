"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/feed/api";

export function UnblockButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <button className="btn btn-sm btn-secondary" disabled={busy} onClick={async () => { setBusy(true); await api(`/api/v1/me/blocks/${id}`, { method: "DELETE" }); router.refresh(); }}>表示する</button>;
}
