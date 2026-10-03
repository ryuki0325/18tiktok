"use client";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";

/** 「探す」の検索欄。ホームの検索ボタンから来た時（?focus=1）は自動でキーボードを出す */
export function ExploreSearch({ focus }: { focus: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focus) return;
    ref.current?.focus({ preventScroll: true });
    // 戻るで再訪した時にまたキーボードが出ないよう、URLから外す
    history.replaceState(history.state, "", "/explore");
  }, [focus]);
  return (
    <form action="/search" role="search" style={{ padding: "12px 16px", position: "sticky", top: 0, zIndex: 10, background: "var(--bg)" }}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 14, top: 12, color: "var(--muted)" }}><Icon name="search" size={22} /></span>
        <input ref={ref} className="input pill" style={{ paddingLeft: 44 }} name="q" type="search" enterKeyHint="search" autoComplete="off"
          placeholder="タグ・投稿者・タイトルで検索" aria-label="キーワードを入力" autoFocus={focus} />
      </div>
    </form>
  );
}
