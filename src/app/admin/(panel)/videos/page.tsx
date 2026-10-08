import Link from "next/link";
import { desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, videos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { statusLabel } from "@/components/status";
import { ago, fmt } from "@/components/format";
import { Thumb } from "@/components/VideoBackdrop";
import { EmergencyButtons } from "../EmergencyButtons";

export const metadata = { title: "動画" };

const TABS: [string, string][] = [
  ["published", "公開中"], ["hidden", "非公開"], ["deleted", "削除済み"], ["all", "すべて"],
];

/** 動画の一覧と、ワンクリックの非公開・削除 */
export default async function AdminVideos({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await requireAdmin(["reviewer", "report_handler"]);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 50);
  const f = TABS.some(([k]) => k === sp.f) ? sp.f! : "published";
  const conn = await db();

  const where = q
    ? or(ilike(videos.title, `%${q}%`), ilike(users.handle, `%${q}%`))
    : f === "all" ? undefined : inArray(videos.status, [f as "published"]);

  const rows = await conn.select({
    v: videos, handle: users.handle,
    reports: sql<number>`(select count(*) from reports r where r.target_id = "videos"."id" and r.status in ('open','in_progress'))::int`,
  }).from(videos).innerJoin(users, eq(users.id, videos.creatorId))
    .where(where).orderBy(desc(videos.createdAt)).limit(60);

  return (
    <>
      <h1>動画</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(([k, l]) => <a key={k} className={`btn btn-sm ${f === k && !q ? "btn-primary" : "btn-secondary"}`} href={`/admin/videos?f=${k}`}>{l}</a>)}
        <form style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <input className="input" name="q" defaultValue={q} placeholder="タイトル・@名前で検索" style={{ height: 34, width: 220, fontSize: 13 }} aria-label="動画を検索" />
          <button className="btn btn-sm btn-secondary">検索</button>
        </form>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.length === 0 && <p className="muted">該当する動画はありません。</p>}
        {rows.map(({ v, handle, reports }) => {
          const [label, cls] = statusLabel(v.status, v.hiddenReason);
          return (
            <div key={v.id} className="card" style={{ padding: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div style={{ width: 72, height: 120, flexShrink: 0, borderRadius: 10, position: "relative", overflow: "hidden", background: "#000" }}>
                <Thumb card={{ hue: v.hue, poster: v.thumbnailUrl }} />
              </div>
              <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b>{v.title}</b>
                  <span className={`badge ${cls}`}>{label}</span>
                  {reports > 0 && <span className="badge b-bad num">通報{reports}件</span>}
                </div>
                <span className="cap">
                  @{handle}・{ago(v.createdAt)}・再生 <span className="num">{fmt(v.viewCount)}</span>・いいね <span className="num">{fmt(v.likeCount + v.baseLikes)}</span>
                  {v.status === "published" && <> ・<Link href={`/?v=${v.id}`} target="_blank" style={{ color: "var(--accent)" }}>見る ↗</Link></>}
                </span>
                {v.statusReason && <span className="cap">理由：{v.statusReason}</span>}
                {v.status !== "deleted" && <EmergencyButtons targetId={v.id} actions={["hide_video", "delete_video"]} compact />}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
