import { totpSetupData } from "@/lib/admin-actions";
import { MfaForm } from "./Form";

export const metadata = { title: "2段階認証" };

export default async function Mfa() {
  const setup = await totpSetupData();
  return (
    <main className="shell"><div className="center-screen" style={{ alignItems: "stretch", textAlign: "left", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0, textAlign: "center" }}>2段階認証</h1>
      {setup ? (
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <p style={{ margin: 0, fontSize: 14 }}>管理画面は2段階認証が必須です。認証アプリ（Google Authenticator など）でQRコードを読み取ってください。</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="認証アプリ用のQRコード" width={200} height={200} style={{ borderRadius: 12, background: "#fff" }} />
          <span className="cap">読み取れない場合はキーを手入力：</span>
          <code className="num" style={{ fontSize: 13, wordBreak: "break-all", userSelect: "all" }}>{setup.secret}</code>
        </div>
      ) : <p className="muted" style={{ margin: 0, textAlign: "center", fontSize: 14 }}>認証アプリに表示されている6桁のコードを入力してください。</p>}
      <MfaForm />
    </div></main>
  );
}
