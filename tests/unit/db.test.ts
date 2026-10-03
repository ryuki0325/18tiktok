import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { createVideo, fileReport, postComment, recordClick, removeDomain, resolveReport, reviewVideo, reportComment } from "@/lib/moderation";
import { appendChained, audit, verifyChain } from "@/lib/ledger";

let db: DB;
let creatorId: string;
let adminId: string;
let viewerId: string;
const published = async () => (await db.select().from(s.videos).where(eq(s.videos.status, "published")));

beforeAll(async () => {
  db = await createDb({ memory: true, seedDemo: true });
  const [c] = await db.select().from(s.users).where(eq(s.users.handle, "luna_night"));
  creatorId = c.id;
  const [a] = await db.select().from(s.users).where(eq(s.users.role, "super_admin"));
  adminId = a.id;
  const [v] = await db.select().from(s.users).where(eq(s.users.handle, "night_owl"));
  viewerId = v.id;
});

describe("シード", () => {
  it("デモ動画とスーパー管理者が入る", async () => {
    expect((await published()).length).toBe(7);
    expect(adminId).toBeTruthy();
  });
});

describe("通報と自動非公開", () => {
  it("未成年の疑いは1件で即非公開、運営が復帰できる", async () => {
    const [v] = await published();
    const r = await fileReport(db, { videoId: v.id, reason: "minor_suspected", reporterKey: "d:aaaa" });
    expect(r).toMatchObject({ ok: true, hidden: true });
    const [after] = await db.select().from(s.videos).where(eq(s.videos.id, v.id));
    expect(after.status).toBe("hidden_by_report");
    const [ticket] = await db.select().from(s.reportTickets).where(eq(s.reportTickets.videoId, v.id));
    expect(ticket.priority).toBe("P0");
    await resolveReport(db, adminId, ticket.id, "restore", "問題なし");
    const [restored] = await db.select().from(s.videos).where(eq(s.videos.id, v.id));
    expect(restored.status).toBe("published");
  });
  it("無断転載は閾値（3件）に達したら非公開。同じ人の重複は数えない", async () => {
    const v = (await published())[1];
    for (const k of ["d:1", "d:1", "d:2"]) {
      const r = await fileReport(db, { videoId: v.id, reason: "unauthorized_repost", reporterKey: k });
      expect(r.ok && r.hidden).toBe(false);
    }
    const r3 = await fileReport(db, { videoId: v.id, reason: "unauthorized_repost", reporterKey: "d:3" });
    expect(r3.ok && r3.hidden).toBe(true);
  });
});

describe("投稿と審査", () => {
  it("同意が揃わないと投稿できない", async () => {
    const r = await createVideo(db, { creatorId, title: "t", description: "", tags: [], consents: [true, true, false], ipHash: "x", userAgent: "ua" });
    expect(r.ok).toBe(false);
  });
  it("投稿は審査待ちになり、同意が追記型ログに残り、承認で公開される", async () => {
    const r = await createVideo(db, { creatorId, title: "新作", description: "説明", tags: ["夜景"], link: "https://example.com/x", consents: [true, true, true], ipHash: "iphash", userAgent: "ua" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.video.status).toBe("pending_review");
    const consents = await db.select().from(s.videoConsents).where(eq(s.videoConsents.videoId, r.video.id));
    expect(consents).toHaveLength(1);
    expect(await reviewVideo(db, adminId, r.video.id, "approve", "")).toBe(true);
    const [v] = await db.select().from(s.videos).where(eq(s.videos.id, r.video.id));
    expect(v.status).toBe("published");
  });
  it("許可リスト外のドメインは審査待ちリンクになる", async () => {
    const r = await createVideo(db, { creatorId, title: "外部", description: "", tags: [], link: "https://unknown-partner.net/p", consents: [true, true, true], ipHash: "x", userAgent: "ua" });
    expect(r.ok && r.linkPending).toBe(true);
  });
  it("短縮URLは拒否", async () => {
    const r = await createVideo(db, { creatorId, title: "短縮", description: "", tags: [], link: "https://bit.ly/x", consents: [true, true, true], ipHash: "x", userAgent: "ua" });
    expect(r.ok).toBe(false);
  });
});

describe("クリック計測", () => {
  it("重複・本人・botのクリックは無効として記録", async () => {
    const [link] = await db.select().from(s.outboundLinks).where(eq(s.outboundLinks.status, "active")).limit(1);
    const [v] = await db.select().from(s.videos).where(eq(s.videos.id, link.videoId));
    const creatorKey = `u:${v.creatorId}`;
    expect((await recordClick(db, { linkId: link.id, viewerKey: "d:viewer1", isBot: false, creatorKey }))?.valid).toBe(true);
    expect((await recordClick(db, { linkId: link.id, viewerKey: "d:viewer1", isBot: false, creatorKey }))?.reason).toBe("dup_window");
    expect((await recordClick(db, { linkId: link.id, viewerKey: creatorKey, isBot: false, creatorKey }))?.reason).toBe("self_click");
    expect((await recordClick(db, { linkId: link.id, viewerKey: "d:bot", isBot: true, creatorKey }))?.reason).toBe("bot");
  });
  it("許可ドメインを外すとリンクが無効になる", async () => {
    const [d] = await db.select().from(s.affiliateDomains).where(eq(s.affiliateDomains.domain, "partner-a.example"));
    const n = await removeDomain(db, adminId, d.id);
    expect(n).toBeGreaterThan(0);
    const active = await db.select().from(s.outboundLinks).where(eq(s.outboundLinks.domain, "partner-a.example"));
    expect(active.every((l) => l.status === "disabled_domain_removed")).toBe(true);
  });
});

describe("コメント", () => {
  it("URLは拒否、NGワードは確認待ち、通報3件で非表示", async () => {
    const [v] = await published();
    expect((await postComment(db, { videoId: v.id, userId: viewerId, body: "https://spam.example 見て" })).ok).toBe(false);
    const ng = await postComment(db, { videoId: v.id, userId: viewerId, body: "JKっぽい" });
    expect(ng.ok && ng.pending).toBe(true);
    const ok = await postComment(db, { videoId: v.id, userId: viewerId, body: "素敵です" });
    if (!ok.ok) throw new Error();
    for (const k of ["a", "b"]) expect((await reportComment(db, { commentId: ok.comment.id, reason: "spam", reporterKey: k })).hidden).toBe(false);
    expect((await reportComment(db, { commentId: ok.comment.id, reason: "spam", reporterKey: "c" })).hidden).toBe(true);
  });
});

describe("追記型ログ", () => {
  it("UPDATE/DELETE はDBが拒否し、チェーンは検証できる", async () => {
    await audit(db, adminId, "test.a", "x", "1");
    await audit(db, adminId, "test.b", "x", "2", { k: [1, 2] });
    expect(await verifyChain(db, s.adminAuditLogs)).toBeNull();
    expect(await verifyChain(db, s.videoConsents)).toBeNull();
    expect(await verifyChain(db, s.reportActions)).toBeNull();
    const appendOnly = (e: unknown) => /append-only/.test(String((e as { cause?: Error }).cause?.message ?? e));
    await expect(db.execute(sql`update admin_audit_logs set action = 'tampered'`)).rejects.toSatisfy(appendOnly);
    await expect(db.execute(sql`delete from video_consents`)).rejects.toSatisfy(appendOnly);
    await appendChained(db, s.adminAuditLogs, { adminId, action: "c", targetType: "x", targetId: null, detail: null });
    expect(await verifyChain(db, s.adminAuditLogs)).toBeNull();
  });
});
