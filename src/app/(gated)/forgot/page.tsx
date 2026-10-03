import { NavBar } from "@/components/NavBar";
import { ForgotForm } from "./Form";

export const metadata = { title: "パスワードを忘れた" };

export default function Forgot() {
  return (
    <div className="screen">
      <NavBar title="パスワードの再設定" back="/login" />
      <div className="sec" style={{ gap: 16, paddingTop: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>登録したメールアドレスに、再設定用のリンクを送ります。</p>
        <ForgotForm />
      </div>
    </div>
  );
}
