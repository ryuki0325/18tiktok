import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { destinations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listAffiliates } from "@/lib/affiliates";
import { NavBar } from "@/components/NavBar";
import { Icon } from "@/components/Icon";
import { AffiliateForm } from "./AffiliateForm";

export const metadata = { title: "アフィリエイトの登録" };

/**
 * 登録済みのアフィリエイトの確認と、追加。
 * いちど登録したものは本人では変えられない（後から別人のIDに差し替える不正を防ぐため）。
 */
export default async function Affiliates() {
  const u = await requireUser("/settings/affiliates");
  const conn = await db();
  const [mine, dests] = await Promise.all([
    listAffiliates(conn, u.id),
    conn.select({ id: destinations.id, serviceName: destinations.serviceName, domain: destinations.domain })
      .from(destinations).where(eq(destinations.status, "approved")).orderBy(destinations.serviceName),
  ]);

  return (
    <div className="screen">
      <NavBar title="アフィリエイトの登録" back="/settings" />
      <div className="sec" style={{ gap: 18, paddingBottom: 24 }}>
        <div className="list">
          {mine.length === 0 && <div className="row"><span className="cap">まだ登録がありません。</span></div>}
          {mine.map((a) => (
            <div key={a.id} className="row" style={{ alignItems: "flex-start" }}>
              <span className="muted"><Icon name="ext" size={20} /></span>
              <span className="grow">
                <b style={{ display: "block" }}>{a.serviceName}</b>
                <span className="cap num">ID：{a.affiliateId}</span>
                {a.status === "disabled" && <span className="badge b-bad" style={{ marginLeft: 6 }}>停止中</span>}
              </span>
              <span className="cap">変更不可</span>
            </div>
          ))}
        </div>
        <p className="cap" style={{ margin: 0 }}>
          登録したサービスとIDは、ご自身では変更・削除できません。まちがえて登録した場合や、ID が変わった場合は
          <Link href="/legal/operator" style={{ color: "var(--accent)" }}>運営への問い合わせ</Link>からご連絡ください。
        </p>
        {dests.length > 0 && <AffiliateForm destinations={dests} />}
      </div>
    </div>
  );
}
