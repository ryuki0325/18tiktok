import { Icon } from "@/components/Icon";

export const metadata = { title: "この地域ではご利用いただけません" };

export default function Unavailable() {
  return (
    <main className="shell">
      <div className="center-screen">
        <div className="ring" style={{ color: "var(--muted)", background: "var(--surface)", boxShadow: "none" }}><Icon name="ban" size={34} /></div>
        <h1 style={{ fontSize: 22, margin: "28px 0 10px" }}>この地域ではご利用いただけません</h1>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.7 }}>お住まいの地域の法令により、現在このサービスを提供していません。<br />This service is not available in your region.</p>
      </div>
    </main>
  );
}
