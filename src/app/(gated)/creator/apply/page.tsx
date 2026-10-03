import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Icon } from "@/components/Icon";
import { ApplyForm } from "./ApplyForm";

export const metadata = { title: "投稿者になる" };

const STEPS = ["申請", "運営の確認", "投稿できるようになります"];

export default async function Apply() {
  const u = await requireUser("/creator/apply");
  const s = u.creatorStatus;
  const step = !s || s === "rejected" ? 0 : s === "pending" ? 1 : 2;
  return (
    <div className="screen">
      <NavBar title="投稿者になる" back="/me" />
      <div className="sec" style={{ gap: 18, paddingBottom: 24 }}>
        <ol style={{ display: "flex", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
          {STEPS.map((t, i) => (
            <li key={t} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ height: 4, borderRadius: 4, background: i <= step ? "var(--accent)" : "var(--surface-2)" }} />
              <span className="cap" style={{ color: i <= step ? "var(--text)" : undefined }}>{i + 1}. {t}</span>
            </li>
          ))}
        </ol>
        {s === "approved" && <><div className="notice info"><Icon name="check" size={18} />投稿者として承認されています。</div><Link className="btn btn-primary" href="/creator/new">動画を投稿する</Link></>}
        {s === "pending" && <div className="notice info"><Icon name="bell" size={18} />申請を受け付けました。運営の確認が終わったら「お知らせ」でお知らせします。</div>}
        {(s === "suspended" || s === "banned") && <div className="notice bad"><Icon name="ban" size={18} />アカウントが停止されています。詳しくは「お知らせ」をご確認ください。</div>}
        {(!s || s === "rejected") && (
          <>
            {s === "rejected" && <div className="notice warn"><Icon name="alert" size={18} />前回の申請は承認されませんでした。内容を見直して再申請できます。</div>}
            <div className="card" style={{ padding: 16, fontSize: 14, lineHeight: 1.7 }}>
              <b>投稿できる動画</b>
              <ul className="dots" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                <li>自分で撮影・出演し、権利を持つ動画だけ</li>
                <li>出演者全員が18歳以上で、公開に同意しているもの</li>
                <li>日本の法令に沿って修整されているもの</li>
              </ul>
              <p className="cap" style={{ margin: "10px 0 0" }}>最初の5本は、公開前に必ず運営が確認します。詳しくは<Link href="/legal/guidelines" style={{ textDecoration: "underline" }}>投稿ガイドライン</Link>をご覧ください。</p>
            </div>
            <div className="notice info"><Icon name="shield" size={18} /><span>本人確認書類の提出は、現在の運用方針の決定待ちのため受け付けていません（決まり次第、この画面に追加されます）。</span></div>
            <ApplyForm />
          </>
        )}
      </div>
    </div>
  );
}
