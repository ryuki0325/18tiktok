import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "ログイン" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  return (
    <div className="screen">
      <NavBar title="ログイン" back="/me" />
      <div className="sec" style={{ gap: 18, paddingTop: 12 }}>
        {reset && <div className="notice info" role="status">パスワードを変更しました。新しいパスワードでログインしてください。</div>}
        <LoginForm next={next ?? "/me"} />
        <p className="cap" style={{ textAlign: "center", margin: 0 }}><Link href="/forgot" style={{ textDecoration: "underline" }}>パスワードを忘れた方</Link></p>
        <p className="cap" style={{ textAlign: "center" }}>アカウントをお持ちでない方は <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} style={{ color: "var(--accent)", fontWeight: 600 }}>新規登録</Link></p>
      </div>
    </div>
  );
}
