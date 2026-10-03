"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/feed/api";

export function TagPicker({ all, initial }: { all: string[]; initial: string[] }) {
  const [sel, setSel] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const done = async (tags: string[]) => {
    setBusy(true);
    await api("/api/v1/me/tags", { method: "PUT", body: { tags } });
    router.replace("/");
    router.refresh();
  };
  return (
    <div className="screen">
      <div className="navbar"><span className="sp44" /><h1 /><button className="iconbtn muted" style={{ width: "auto", padding: "0 8px", fontSize: 15 }} onClick={() => done([])} disabled={busy}>スキップ</button></div>
      <div className="sec" style={{ gap: 8, paddingTop: 8, flex: 1 }}>
        <h1 className="ttl" style={{ fontSize: 24 }}>好きなテーマを選んでください</h1>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>3つ以上選ぶと、おすすめが好みに合わせて変わります。あとから設定で変更できます。</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {all.map((t) => (
            <button key={t} className="chip" style={{ height: 40, padding: "0 16px", fontSize: 14.5 }} aria-pressed={sel.includes(t)}
              onClick={() => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : s.length < 10 ? [...s, t] : s))}>#{t}</button>
          ))}
        </div>
      </div>
      <div className="bottom-fixed">
        <button className="btn btn-primary" disabled={sel.length < 3 || busy} onClick={() => done(sel)}>はじめる（{sel.length}つ選択中）</button>
      </div>
    </div>
  );
}
