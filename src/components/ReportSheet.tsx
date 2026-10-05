"use client";
import Link from "next/link";
import { useState } from "react";
import type { ReportTarget } from "@/db/schema";
import { REASON_SPEC, reasonsFor, TARGET_LABEL } from "@/lib/report-reasons";
import { Icon } from "./Icon";
import { api } from "./feed/api";
import { useToast } from "./Toast";

/**
 * 通報のシート（動画・プロフィール・コメント共通）。
 * 重い理由は、送った時点でいったん非公開になることを先に伝える。
 */
export function ReportSheet({ targetType, targetId, label, onClose }: {
  targetType: ReportTarget; targetId: string; label?: string; onClose: (hidden?: boolean) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const reasons = reasonsFor(targetType);
  const needDetail = reason === "other";
  const canSend = !!reason && (!needDetail || detail.trim().length > 0) && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    const r = await api<{ hidden: boolean; duplicate: boolean }>("/api/v1/reports", {
      method: "POST", body: { targetType, targetId, reason, description: detail || undefined },
    });
    setBusy(false);
    if (!r.ok) { toast(r.data.error?.message ?? "送信できませんでした"); return; }
    toast(r.data.duplicate ? "すでに通報を受け付けています"
      : r.data.hidden ? "通報を受け付けました。運営が確認するまで、この内容は表示されません。"
        : "通報を受け付けました。ご協力ありがとうございます。");
    onClose(r.data.hidden);
  };

  return (
    <>
      <div className="sheet-bg" onClick={() => onClose()} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="報告する">
        <span className="grab" />
        <div className="hd">
          <b style={{ fontSize: 20 }}>報告する</b>
          <button className="iconbtn" style={{ marginRight: -8 }} onClick={() => onClose()} aria-label="閉じる"><Icon name="x" size={22} /></button>
        </div>
        <p className="muted" style={{ margin: "-6px 0 0", fontSize: 14 }}>
          {TARGET_LABEL[targetType]}{label ? `「${label}」` : ""}の問題を運営に知らせます。通報したことが相手に伝わることはありません。
        </p>
        <div role="radiogroup" aria-label="報告の理由" style={{ overflowY: "auto", maxHeight: "44dvh" }}>
          {reasons.map((k) => {
            const spec = REASON_SPEC[k];
            return (
              <button key={k} className="radio" role="radio" aria-checked={reason === k} onClick={() => setReason(k)}>
                <span className="dot" />
                <span style={{ flex: 1, textAlign: "left" }}>
                  {spec.label}
                  {spec.hint && <span className="cap" style={{ display: "block" }}>{spec.hint}</span>}
                </span>
                {spec.immediate && <span className="badge b-bad" style={{ flexShrink: 0 }}>即非公開</span>}
              </button>
            );
          })}
        </div>
        <textarea className="input" placeholder={needDetail ? "詳しい内容（必須・1000文字まで）" : "補足があれば（任意）"}
          maxLength={1000} value={detail} onChange={(e) => setDetail(e.target.value)} aria-label="詳しい内容" rows={2} />
        <button className="btn btn-primary pill" style={{ height: 52 }} disabled={!canSend} onClick={send}>{busy ? "送信中…" : "送信"}</button>
        <span className="cap" style={{ textAlign: "center" }}>
          緊急の被害（盗撮・同意のない公開など）は、<Link href="/takedown" style={{ color: "var(--accent)" }}>削除請求の窓口</Link>からも受け付けています。
        </span>
      </div>
    </>
  );
}
