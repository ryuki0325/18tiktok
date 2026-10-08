import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { destinations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Icon } from "@/components/Icon";
import { requestTime } from "@/lib/settings";
import { MIN_AGE, verifyMethod } from "@/lib/verification";
import { ATTESTATIONS } from "@/lib/affiliates";
import { ApplyForm } from "./ApplyForm";

/** 方式ごとに、申請者へ伝える内容を変える */
const METHOD_NOTE: Record<string, string> = {
  self_declared: "入力した生年月日は運営の記録として保存され、年齢の確認に使います。虚偽の申告が分かった場合はアカウントを停止します。",
  document_manual: "このあと、運営が身分証で年齢を確認します。確認が済むまで投稿はできません。書類の画像は確認後すぐに破棄します。",
  ekyc: "このあと、本人確認サービスで年齢を確認します。確認が済むまで投稿はできません。書類の画像は当サイトには保存されません。",
};

export const metadata = { title: "投稿者になる" };

// 運営の承認を置かないので、登録できたらすぐ投稿できる
const STEPS = ["登録", "投稿できるようになります"];

export default async function Apply() {
  const u = await requireUser("/creator/apply");
  const conn = await db();
  // 投稿者になるには、承認済みの送客先で自分の販売ページを持っていることが条件
  const dests = await conn.select({ id: destinations.id, serviceName: destinations.serviceName, domain: destinations.domain })
    .from(destinations).where(eq(destinations.status, "approved")).orderBy(destinations.serviceName);
  const s = u.creatorStatus;
  const step = s === "approved" ? 1 : 0;
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
        {s === "pending" && <div className="notice info"><Icon name="bell" size={18} />年齢の確認が済みしだい投稿できるようになります。</div>}
        {(s === "suspended" || s === "banned") && <div className="notice bad"><Icon name="ban" size={18} />アカウントが停止されています。詳しくは「お知らせ」をご確認ください。</div>}
        {(!s || s === "rejected") && (
          <>
            {s === "rejected" && <div className="notice warn"><Icon name="alert" size={18} />前回の登録は取り消されています。内容を見直してもう一度登録できます。</div>}
            <div className="card" style={{ padding: 16, fontSize: 14, lineHeight: 1.7 }}>
              <b>投稿できる動画</b>
              <ul className="dots" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                <li>自分で撮影・出演し、権利を持つ動画だけ</li>
                <li>出演者全員が18歳以上で、公開に同意しているもの</li>
                <li>日本の法令に沿って修整されているもの</li>
                <li><b>アフィリエイトIDを登録していること</b></li>
                <li><b>投稿するのは、その作品のサンプル動画</b></li>
              </ul>
              <p className="cap" style={{ margin: "10px 0 0" }}>
                <b>投稿すると約1分、AIが公開してよいか自動で確認します。</b>その間は自分でも共有できず、確認後に全員へ公開されます。登録そのものに運営の確認はありません。
                詳しくは<Link href="/legal/guidelines" style={{ textDecoration: "underline" }}>投稿ガイドライン</Link>をご覧ください。
              </p>
            </div>
            {dests.length === 0 ? (
              <div className="notice warn"><Icon name="alert" size={18} /><span>いま登録できるサービスがありません。運営がサービスを追加するまで、投稿者の登録はできません。</span></div>
            ) : (
              <ApplyForm minAge={MIN_AGE} methodNote={METHOD_NOTE[verifyMethod()]} destinations={dests}
                attestations={ATTESTATIONS.map((a) => ({ key: a.key, text: a.text }))}
                maxDate={new Date(requestTime() - MIN_AGE * 365.25 * 86400_000).toISOString().slice(0, 10)} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
