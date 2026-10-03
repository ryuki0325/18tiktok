"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/feed/api";

export function FollowButton({ creatorId, initial, loggedIn }: { creatorId: string; initial: boolean; loggedIn: boolean }) {
  const [on, setOn] = useState(initial);
  const router = useRouter();
  const click = async () => {
    if (!loggedIn) { router.push(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
    setOn(!on);
    const r = await api(`/api/v1/creators/${creatorId}/follow`, { method: on ? "DELETE" : "PUT" });
    if (!r.ok) setOn(on); else router.refresh();
  };
  return <button className={`btn ${on ? "btn-secondary" : "btn-primary"}`} onClick={click}>{on ? "フォロー中" : "フォローする"}</button>;
}
