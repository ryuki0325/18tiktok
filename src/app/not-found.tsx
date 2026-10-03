import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell"><div className="center-screen">
      <h1 style={{ fontSize: 22 }}>ページが見つかりません</h1>
      <p className="muted" style={{ fontSize: 14, margin: "0 0 24px" }}>削除されたか、URLが間違っている可能性があります。</p>
      <Link className="btn btn-primary" href="/">ホームへ</Link>
    </div></main>
  );
}
