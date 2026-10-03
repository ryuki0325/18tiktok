import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { creatorProfiles, outboundLinks, tags, users, videoConsents, videoTags, videos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { reviewAction } from "@/lib/admin-actions";
import { VideoBackdrop } from "@/components/VideoBackdrop";
import { ago } from "@/components/format";
import { audienceLabel, intensityLabel } from "@/lib/audience";

export const metadata = { title: "動画審査" };

const REJECT = ["ガイドラインに沿っていません", "修整が不十分です", "未成年を連想させる表現があります", "タグと内容が一致していません", "転載の疑いがあります"];

export default async function Reviews() {
  await requireAdmin(["reviewer"]);
  const conn = await db();
  const rows = await conn.select({ v: videos, handle: users.handle, approved: creatorProfiles.approvedPosts, violations: creatorProfiles.violationPoints })
    .from(videos).innerJoin(users, eq(users.id, videos.creatorId)).innerJoin(creatorProfiles, eq(creatorProfiles.userId, videos.creatorId))
    .where(eq(videos.status, "pending_review")).orderBy(asc(videos.createdAt)).limit(50);
  const ids = rows.map((r) => r.v.id);
  const [consents, tagRows, links] = ids.length ? await Promise.all([
    conn.select().from(videoConsents).where(inArray(videoConsents.videoId, ids)),
    conn.select({ videoId: videoTags.videoId, name: tags.name }).from(videoTags).innerJoin(tags, eq(tags.id, videoTags.tagId)).where(inArray(videoTags.videoId, ids)),
    conn.select().from(outboundLinks).where(inArray(outboundLinks.videoId, ids)),
  ]) : [[], [], []];
  return (
    <>
      <h1>動画審査 <span className="muted num" style={{ fontSize: 15 }}>{rows.length}件</span></h1>
      {rows.length === 0 && <p className="muted">審査待ちの動画はありません。</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map(({ v, handle, approved, violations }) => {
          const c = consents.find((x) => x.videoId === v.id);
          const l = links.find((x) => x.videoId === v.id);
          return (
            <div key={v.id} className="card" style={{ padding: 16, display: "grid", gridTemplateColumns: "96px 1fr", gap: 16 }}>
              <div style={{ width: 96, height: 150, borderRadius: 12, position: "relative", overflow: "hidden" }}><VideoBackdrop hue={v.hue} /></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}><b style={{ fontSize: 16 }}>{v.title}</b><span className="cap">@{handle}・承認済み{approved}本・違反{violations}・{ago(v.createdAt)}</span></div>
                {v.description && <p style={{ margin: 0, fontSize: 14 }}>{v.description}</p>}
                <div className="cap">ジャンル：{audienceLabel(v.category)}・刺激の強さ：<b style={{ color: v.intensity === 3 ? "var(--bad)" : undefined }}>{intensityLabel(v.intensity)}</b>（投稿者の申告。内容と合っているか確認）</div>
                <div className="cap">タグ：{tagRows.filter((t) => t.videoId === v.id).map((t) => `#${t.name}`).join(" ") || "なし"}</div>
                <div className="cap">リンク：{l ? `${l.url}（${l.status === "active" ? "許可ドメイン" : "ドメイン審査待ち"}）` : "なし"}</div>
                <div className="cap">同意記録：{c ? `v${c.consentVersion}・権利 ${c.ownsRights ? "✓" : "✗"}・出演者18歳以上/同意 ${c.performersAdultConsented ? "✓" : "✗"}・転載でない ${c.notReposted ? "✓" : "✗"}・${c.createdAt.toLocaleString("ja-JP")}` : <span style={{ color: "var(--bad)" }}>なし</span>}</div>
                {v.statusReason && <div className="cap">{v.statusReason}</div>}
                <form action={reviewAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                  <input type="hidden" name="id" value={v.id} />
                  <button className="btn btn-sm btn-primary" name="decision" value="approve">承認して公開</button>
                  <select className="input" name="note" style={{ height: 36, width: "auto", fontSize: 13 }} aria-label="差し戻しの理由">{REJECT.map((r) => <option key={r}>{r}</option>)}</select>
                  <button className="btn btn-sm btn-danger" name="decision" value="reject">差し戻す</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
