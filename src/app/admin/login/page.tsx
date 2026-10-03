import { AdminLoginForm } from "./Form";

export const metadata = { title: "管理画面ログイン" };

export default function AdminLogin() {
  return (
    <main className="shell"><div className="center-screen" style={{ alignItems: "stretch", textAlign: "left", gap: 16 }}>
      <div><div className="brand" style={{ fontSize: 44, textAlign: "center" }}>Glow</div><p className="cap" style={{ textAlign: "center" }}>運営管理画面</p></div>
      <AdminLoginForm />
    </div></main>
  );
}
