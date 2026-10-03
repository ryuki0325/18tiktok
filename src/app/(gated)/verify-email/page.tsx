import Link from "next/link";
import { verifyEmailToken } from "@/lib/account-actions";
import { Icon } from "@/components/Icon";

export const metadata = { title: "メールアドレスの確認" };

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmailToken(token) : false;
  return (
    <div className="center-screen">
      <div className="ring" style={ok ? undefined : { color: "var(--bad)" }}><Icon name={ok ? "check" : "alert"} size={34} /></div>
      <h1 style={{ fontSize: 22, margin: "24px 0 10px" }}>{ok ? "確認できました" : "リンクが無効です"}</h1>
      <p className="muted" style={{ fontSize: 14, margin: "0 0 28px" }}>{ok ? "コメントや投稿者申請ができるようになりました。" : "期限切れか、すでに使われたリンクです。マイページから再送できます。"}</p>
      <Link className="btn btn-primary" href="/me">マイページへ</Link>
    </div>
  );
}
