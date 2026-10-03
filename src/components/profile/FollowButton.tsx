"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/feed/api";
import { useToast } from "@/components/Toast";

/** フォローのボタン。相手も自分をフォローしていれば「友達」と出す（TikTokと同じ） */
export function FollowButton({ creatorId, initial, followsYou = false, loggedIn, handle, small = false }: {
  creatorId: string; initial: boolean; followsYou?: boolean; loggedIn: boolean; handle?: string; small?: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const click = async () => {
    if (!loggedIn) { router.push(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    const next = !on;
    setOn(next);
    setBusy(true);
    const r = await api(`/api/v1/creators/${creatorId}/follow`, { method: next ? "PUT" : "DELETE" });
    setBusy(false);
    if (!r.ok) { setOn(!next); toast(r.data.error?.message ?? "設定できませんでした"); return; }
    if (handle) toast(next ? `@${handle} をフォローしました` : "フォローを解除しました");
    router.refresh();
  };
  const label = on ? (followsYou ? "友達" : "フォロー中") : followsYou ? "フォローバック" : "フォロー";
  return (
    <button className={`btn ${on ? "btn-secondary" : "btn-primary"}${small ? " btn-sm" : ""}`} onClick={click} disabled={busy} aria-pressed={on}>{label}</button>
  );
}
