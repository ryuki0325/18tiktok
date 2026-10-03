import { requireAdmin } from "@/lib/auth";
import { bumpAgeGateVersionAction, runJobAction, settingsAction } from "@/lib/admin-actions";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "設定" };

export default async function Settings() {
  await requireAdmin(["super_admin"]);
  const g = getSetting;
  const [full, tRepost, tInapp, tOther, cHide, cRate, dedupe, ttl, ver, mode, email, name, regions, ng] = await Promise.all([
    g("review.new_creator_full_review_count"), g("report.auto_hide_threshold.unauthorized_repost"), g("report.auto_hide_threshold.inappropriate"), g("report.auto_hide_threshold.other"),
    g("comments.auto_hide_threshold"), g("comments.rate_limit_per_hour"), g("clicks.dedupe_window_sec"), g("age_gate.ttl_days"), g("age_gate.version"),
    g("operator.display_mode"), g("operator.contact_email"), g("operator.name"), g("geo.blocked_regions"), g("ng_words"),
  ]);
  const num = (k: string, label: string, v: number, hint?: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span className="label">{label}{hint && <small>{hint}</small>}</span><input className="input num" type="number" min={0} name={k} defaultValue={v} style={{ height: 40 }} /></label>
  );
  return (
    <>
      <h1>設定</h1>
      <form action={settingsAction} style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 760 }}>
        <section className="card" style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
          <h2 style={{ gridColumn: "1/-1", fontSize: 15, margin: 0 }}>審査・通報の閾値</h2>
          {num("review.new_creator_full_review_count", "新規投稿者の全件審査", full, "本")}
          {num("report.auto_hide_threshold.unauthorized_repost", "自動非公開：無断転載", tRepost, "件")}
          {num("report.auto_hide_threshold.inappropriate", "自動非公開：不適切", tInapp, "件")}
          {num("report.auto_hide_threshold.other", "自動非公開：その他", tOther, "件")}
          {num("comments.auto_hide_threshold", "コメント非表示の通報数", cHide, "件")}
          {num("comments.rate_limit_per_hour", "コメント上限", cRate, "件/時")}
          {num("clicks.dedupe_window_sec", "クリック重複の除外", dedupe, "秒")}
          {num("age_gate.ttl_days", "年齢確認の有効期限", ttl, "日")}
          <p className="cap" style={{ gridColumn: "1/-1", margin: 0 }}>未成年の疑い・同意のない撮影の通報は、件数に関係なく1件で即非公開になります（変更できません）。</p>
        </section>
        <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>運営者表示</h2>
          <select className="input" name="operator.display_mode" defaultValue={mode} style={{ height: 40, maxWidth: 320 }} aria-label="表示方法">
            <option value="contact_only">問い合わせ窓口のみ</option><option value="corporation">法人名を表示</option><option value="agent">代理窓口を表示</option>
          </select>
          <input className="input" name="operator.contact_email" defaultValue={email} placeholder="窓口メールアドレス" style={{ height: 40 }} aria-label="窓口メールアドレス" />
          <input className="input" name="operator.name" defaultValue={name} placeholder="法人名・代理窓口名（表示する場合）" style={{ height: 40 }} aria-label="法人名・代理窓口名" />
        </section>
        <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>提供しない地域</h2>
          <p className="cap" style={{ margin: 0 }}>国コード（例：GB, FR）や州コード（例：US-TX）をカンマ区切りで。強い年齢確認が法律で義務づけられている地域を、対応するまでここに入れます。地域はCDNのヘッダ（CF-IPCountry など）で判定します。</p>
          <input className="input num" name="geo.blocked_regions" defaultValue={regions.join(", ")} style={{ height: 40 }} aria-label="提供しない地域" />
        </section>
        <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>コメントのNGワード</h2>
          <p className="cap" style={{ margin: 0 }}>1行に1語。含まれるコメントは運営の確認待ちになります。</p>
          <textarea className="input" name="ng_words" defaultValue={ng.join("\n")} style={{ height: 140 }} aria-label="NGワード" />
        </section>
        <button className="btn btn-primary" style={{ maxWidth: 240 }}>保存</button>
      </form>
      <section className="card" style={{ padding: 16, marginTop: 24, maxWidth: 760, display: "flex", flexDirection: "column", gap: 10 }}>
        <b>定期処理</b>
        <span className="cap">外部のcronサービスから <code>POST /api/cron/link-health</code> と <code>POST /api/cron/purge</code> を呼ぶと自動化できます（環境変数 CRON_SECRET が必要）。ここから今すぐ実行することもできます。</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <form action={runJobAction}><input type="hidden" name="job" value="link-health" /><button className="btn btn-sm btn-secondary">外部リンクの死活確認を実行</button></form>
          <form action={runJobAction}><input type="hidden" name="job" value="purge" /><button className="btn btn-sm btn-secondary">期限切れデータの削除を実行</button></form>
        </div>
      </section>
      <form action={bumpAgeGateVersionAction} className="card" style={{ padding: 16, marginTop: 24, maxWidth: 760, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 240 }}><b>年齢確認の文言を変えたとき</b><br /><span className="cap">版を上げると、全員にもう一度年齢確認を表示します（現在 v{ver}）。</span></span>
        <button className="btn btn-sm btn-danger">版を上げる</button>
      </form>
    </>
  );
}
