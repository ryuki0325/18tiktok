"use client";
import { useState } from "react";
import { Icon } from "../Icon";

/** プロフィールのリンクを共有（スマホはOSの共有、他はリンクをコピー） */
export function ShareProfile({ handle }: { handle: string }) {
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = `${location.origin}/u/${encodeURIComponent(handle)}`;
    if (navigator.share) {
      try { await navigator.share({ url, title: `@${handle}` }); } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {}
  };
  return (
    <button className="btn btn-secondary" onClick={share} aria-label="プロフィールを共有">
      <Icon name={done ? "check" : "share"} size={20} />
    </button>
  );
}
