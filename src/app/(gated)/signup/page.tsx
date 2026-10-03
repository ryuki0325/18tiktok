import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "新規登録" };

export default function Signup() {
  return (
    <div className="screen">
      <NavBar title="新規登録" back="/login" />
      <div className="sec" style={{ gap: 18, paddingTop: 12, paddingBottom: 24 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>アカウントは任意です。フォロー・コメント・お気に入りの同期、動画の投稿に使います。</p>
        <SignupForm />
        <p className="cap" style={{ textAlign: "center" }}>すでにアカウントをお持ちの方は <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600 }}>ログイン</Link></p>
      </div>
    </div>
  );
}
