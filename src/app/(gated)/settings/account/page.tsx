import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { AccountForms } from "./Forms";

export const metadata = { title: "アカウント" };

export default async function Account() {
  const u = await requireUser("/settings/account");
  return (
    <div className="screen">
      <NavBar title="アカウント" back="/settings" />
      <div className="sec" style={{ gap: 20, paddingBottom: 32 }}>
        <div className="list">
          <div className="row"><span className="grow cap">メールアドレス</span><span style={{ fontSize: 14 }}>{u.email}</span></div>
          <div className="row"><span className="grow cap">ユーザー名</span><span style={{ fontSize: 14 }}>@{u.handle}</span></div>
          <div className="row"><span className="grow cap">メール確認</span><span style={{ fontSize: 14 }}>{u.emailVerifiedAt ? "確認済み" : "未確認"}</span></div>
        </div>
        <AccountForms />
      </div>
    </div>
  );
}
