"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ counts }: { counts: Record<string, number> }) {
  const p = usePathname();
  const items: [string, string, number?][] = [
    ["/admin", "ダッシュボード"], ["/admin/reviews", "動画審査", counts.reviews], ["/admin/reports", "通報", counts.reports],
    ["/admin/creators", "投稿者", counts.creators], ["/admin/comments", "コメント", counts.comments], ["/admin/domains", "許可ドメイン", counts.links],
    ["/admin/takedowns", "削除請求", counts.takedowns], ["/admin/featured", "特集枠"], ["/admin/admins", "管理者"], ["/admin/settings", "設定"], ["/admin/audit", "監査ログ"],
  ];
  return (
    <nav style={{ display: "contents" }}>
      {items.map(([href, label, n]) => (
        <Link key={href} href={href} aria-current={(href === "/admin" ? p === href : p.startsWith(href)) ? "page" : undefined}>
          <span>{label}</span>{n ? <span className="badge b-bad num">{n}</span> : null}
        </Link>
      ))}
      <Link href="/">サイトを見る ↗</Link>
    </nav>
  );
}
