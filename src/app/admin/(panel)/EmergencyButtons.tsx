"use client";
import { useState } from "react";
import { emergencyActionForm } from "@/lib/admin-actions";
import type { EmergencyAction } from "@/lib/safety";

const LABEL: Record<EmergencyAction, string> = {
  hide_video: "動画を非公開", delete_video: "動画を削除", suspend_user: "アカウント停止",
  ban_comments: "コメント停止", ban_posting: "投稿停止", disable_link: "リンク停止", hide_all_videos: "全動画を非公開",
};
/** 取り消しにくい操作。押す前に確認する */
const HEAVY: EmergencyAction[] = ["delete_video", "suspend_user", "hide_all_videos"];

/**
 * 管理画面のワンクリック操作。
 * 理由を書かないと押せない（監査ログに何のための操作か残すため）。
 */
export function EmergencyButtons({ targetId, actions, compact = false }: { targetId: string; actions: EmergencyAction[]; compact?: boolean }) {
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: EmergencyAction) => {
    if (!reason.trim()) { setDone("理由を入力してください"); return; }
    if (HEAVY.includes(action) && !confirm(`${LABEL[action]}を実行します。よろしいですか？\n理由：${reason}`)) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("action", action); fd.set("id", targetId); fd.set("reason", reason);
    try { const r = await emergencyActionForm(fd); setDone(`${r.label}を実行しました`); } catch { setDone("実行できませんでした"); }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由（必須・記録に残ります）"
        style={{ height: 34, maxWidth: compact ? 200 : 300, fontSize: 13 }} aria-label="理由" />
      {actions.map((a) => (
        <button key={a} type="button" disabled={busy} onClick={() => run(a)}
          className={`btn btn-sm ${HEAVY.includes(a) ? "btn-danger" : "btn-secondary"}`}>{LABEL[a]}</button>
      ))}
      {done && <span className="cap" style={{ color: done.includes("できません") || done.includes("入力") ? "var(--bad)" : "var(--ok)" }}>{done}</span>}
    </div>
  );
}
