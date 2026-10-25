import { desc } from "drizzle-orm";
import { db } from "@/db";
import { promos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { promoAction } from "@/lib/admin-actions";
import { fmt } from "@/components/format";
import { ConfirmButton } from "../ConfirmButton";
import { PromoForm } from "./PromoForm";

export const metadata = { title: "広告・アフィリ" };

const KIND: Record<string, string> = { affiliate: "アフィリ送客", sponsor: "スポンサー/PR", network: "広告NW" };
const CAT: Record<string, string> = { all: "全員", women: "女性向け", men: "男性向け", gay: "ゲイ向け", lesbian: "レズ向け" };

/**
 * 広告・アフィリ枠の管理。フィードに差し込む収益枠をここで作る。
 * ライブチャット・出会い系・グッズEC・VPN 等への送客、スポンサーPR、広告ネットワークのコードに対応。
 */
export default async function Promos() {
  await requireAdmin(["super_admin"]);
  const conn = await db();
  const rows = await conn.select().from(promos).orderBy(desc(promos.createdAt));

  return (
    <>
      <h1>広告・アフィリ枠</h1>
      <p className="cap" style={{ maxWidth: 640 }}>
        フィードに一定間隔で差し込む収益枠です。<b>決済は不要</b>（送客＝アフィリ、または広告ネットワーク）。
        ライブチャット・出会い系・グッズ・VPN 等への送客はここに「アフィリ送客」で登録してください。
      </p>

      <PromoForm />

      <div className="card" style={{ padding: 8, maxWidth: 760, display: "flex", flexDirection: "column" }}>
        {rows.length === 0 ? (
          <p className="cap" style={{ padding: 12 }}>まだ枠がありません。上のフォームから追加してください。</p>
        ) : rows.map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b>{p.title || (p.kind === "network" ? "（広告コード）" : "（無題）")}</b>
              <span className="cap" style={{ display: "block" }}>
                {KIND[p.kind]}・{CAT[p.category]}・重み{p.weight}・表示 {fmt(p.impressions)}・クリック {fmt(p.clicks)}
              </span>
              {p.targetUrl && <span className="cap" style={{ display: "block", wordBreak: "break-all", opacity: 0.7 }}>{p.targetUrl}</span>}
            </div>
            <span className={`badge ${p.active ? "b-ok" : "b-bad"}`} style={{ flexShrink: 0 }}>{p.active ? "表示中" : "停止"}</span>
            <form action={promoAction}>
              <input type="hidden" name="op" value="toggle" />
              <input type="hidden" name="id" value={p.id} />
              <button className="btn btn-sm btn-secondary">{p.active ? "止める" : "出す"}</button>
            </form>
            <form action={promoAction}>
              <input type="hidden" name="id" value={p.id} />
              <ConfirmButton className="btn btn-sm btn-secondary" name="op" value="delete" message="この枠を削除します。よろしいですか？">削除</ConfirmButton>
            </form>
          </div>
        ))}
      </div>
    </>
  );
}
