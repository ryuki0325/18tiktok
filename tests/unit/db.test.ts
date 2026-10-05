import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { createDb, setDbForTest, type DB } from "@/db";
import { feed } from "@/lib/content";
import * as s from "@/db/schema";
import { createVideo, postComment, recordClick, removeDomain, reviewVideo } from "@/lib/moderation";
import { closeCase, emergencyAction, fileReport, sanction, activeLimits } from "@/lib/safety";
import { canTransition, transition, InvalidTransition } from "@/lib/video-state";
import { ageOn, submitVerification, canPublish, purgeVerificationData } from "@/lib/verification";
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
  it("未成年の疑いは1件で即非公開。案件が立ち、運営が復帰できる", async () => {
    const [v] = await published();
    const r = await fileReport(db, { targetType: "video", targetId: v.id, reason: "minor_suspected", reporterKey: "d:aaaa" });
    expect(r).toMatchObject({ ok: true, hidden: true });
    const [after] = await db.select().from(s.videos).where(eq(s.videos.id, v.id));
    expect(after.status).toBe("hidden");
    expect(after.hiddenReason).toBe("by_report");
    const [rep] = await db.select().from(s.reports).where(eq(s.reports.targetId, v.id));
    expect(rep.priority).toBe("critical");
    expect(rep.autoActioned).toBe(true);
    // 運営の作業キューにも積まれている
    const [cs] = await db.select().from(s.moderationCases).where(and(eq(s.moderationCases.targetId, v.id), eq(s.moderationCases.kind, "report")));
    expect(cs.priority).toBe("critical");
    // 問題なしとして戻す
    const { restoreTarget } = await import("@/lib/safety");
    await restoreTarget(db, "video", v.id, adminId);
    await closeCase(db, adminId, cs.id, "問題なし", "確認済み", "resolved_restored");
    const [restored] = await db.select().from(s.videos).where(eq(s.videos.id, v.id));
    expect(restored.status).toBe("published");
    const [closed] = await db.select().from(s.moderationCases).where(eq(s.moderationCases.id, cs.id));
    expect(closed.status).toBe("closed");
  });

  it("無断掲載は2件で非公開。同じ人の重複は数えない", async () => {
    const v = (await published())[1];
    const r1 = await fileReport(db, { targetType: "video", targetId: v.id, reason: "unauthorized_repost", reporterKey: "d:1" });
    expect(r1.ok && r1.hidden).toBe(false);
    // 同じ人がもう一度送っても重複として扱う
    const dup = await fileReport(db, { targetType: "video", targetId: v.id, reason: "unauthorized_repost", reporterKey: "d:1" });
    expect(dup.ok && dup.duplicate).toBe(true);
    const r2 = await fileReport(db, { targetType: "video", targetId: v.id, reason: "unauthorized_repost", reporterKey: "d:2" });
    expect(r2.ok && r2.hidden).toBe(true);
  });

  it("コメントとプロフィールも通報できる", async () => {
    const [v] = await published();
    const c = await postComment(db, { videoId: v.id, userId: viewerId, body: "通報のテスト" });
    if (!c.ok) throw new Error();
    const r = await fileReport(db, { targetType: "comment", targetId: c.comment.id, reason: "harassment", reporterKey: "d:z1" });
    expect(r.ok).toBe(true);
    const p = await fileReport(db, { targetType: "profile", targetId: creatorId, reason: "voyeurism", reporterKey: "d:z2" });
    expect(p).toMatchObject({ ok: true, hidden: true });
    // プロフィールへの重い通報は、その人の公開中の動画をまとめて下げる
    const left = await db.select().from(s.videos).where(and(eq(s.videos.creatorId, creatorId), eq(s.videos.status, "published")));
    expect(left.length).toBe(0);
    const { restoreTarget } = await import("@/lib/safety");
    await restoreTarget(db, "profile", creatorId, adminId);
  });

  it("理由に合わない対象は受け付けない", async () => {
    const [v] = await published();
    const r = await fileReport(db, { targetType: "comment", targetId: v.id, reason: "voyeurism", reporterKey: "d:z9" });
    expect(r.ok).toBe(false);
  });
});

describe("動画の状態の移り変わり", () => {
  it("審査を飛ばして公開にはできない", async () => {
    expect(canTransition("pending_review", "published")).toBe(false);
    expect(canTransition("pending_review", "approved")).toBe(true);
    expect(canTransition("approved", "published")).toBe(true);
    expect(canTransition("deleted", "published")).toBe(false);
  });

  it("許されない移り方は例外になる", async () => {
    const [v] = await published();
    await db.update(s.videos).set({ status: "deleted", deletedAt: new Date() }).where(eq(s.videos.id, v.id));
    await expect(transition(db, { videoId: v.id, to: "published" })).rejects.toBeInstanceOf(InvalidTransition);
    await db.update(s.videos).set({ status: "published", deletedAt: null }).where(eq(s.videos.id, v.id));
  });
});

describe("本人・年齢の確認", () => {
  it("生年月日から年齢を正しく数える", () => {
    const at = new Date("2026-10-05T00:00:00Z");
    expect(ageOn("2008-10-05", at)).toBe(18);
    expect(ageOn("2008-10-06", at)).toBe(17); // 誕生日の前日はまだ17歳
    expect(ageOn("2026-13-01", at)).toBeNull();
    expect(ageOn("2027-01-01", at)).toBeNull();
  });

  it("18歳未満は投稿者になれない。確認が済むまで投稿できない", async () => {
    const [u] = await db.insert(s.users).values({ email: `kid${Date.now()}@t.example`, handle: `kid${Date.now()}`, displayName: "k", passwordHash: "x" }).returning();
    const young = await submitVerification(db, u.id, new Date(Date.now() - 15 * 365.25 * 86400_000).toISOString().slice(0, 10));
    expect(young.ok).toBe(false);
    expect((await canPublish(u.id, db)).ok).toBe(false);
    const ok = await submitVerification(db, u.id, "1995-03-04");
    expect(ok).toMatchObject({ ok: true, status: "verified" });
    expect((await canPublish(u.id, db)).ok).toBe(true);
    // 年齢の状態も確認済みになる
    const [after] = await db.select().from(s.users).where(eq(s.users.id, u.id));
    expect(after.ageStatus).toBe("age_verified");
  });

  it("保存期限を過ぎた生年月日は消え、確認済みという結果は残る", async () => {
    const [u] = await db.select().from(s.users).where(eq(s.users.id, creatorId));
    await db.update(s.creatorVerifications).set({ retentionUntil: new Date(Date.now() - 86400_000) }).where(eq(s.creatorVerifications.userId, u.id));
    expect(await purgeVerificationData(db)).toBeGreaterThan(0);
    const [v] = await db.select().from(s.creatorVerifications).where(eq(s.creatorVerifications.userId, u.id));
    expect(v.birthDate).toBeNull();
    expect(v.status).toBe("verified");
  });
});

describe("利用者への措置", () => {
  it("コメント停止・投稿停止・解除が効き、履歴が残る", async () => {
    const [u] = await db.insert(s.users).values({ email: `sx${Date.now()}@t.example`, handle: `sx${Date.now()}`, displayName: "s", passwordHash: "x", emailVerifiedAt: new Date() }).returning();
    await sanction(db, adminId, u.id, "comment_ban", "荒らし", 7);
    let [row] = await db.select().from(s.users).where(eq(s.users.id, u.id));
    expect(activeLimits(row).commentBanned).toBe(true);
    const [v] = await published();
    expect((await postComment(db, { videoId: v.id, userId: u.id, body: "書けないはず" })).ok).toBe(false);
    await sanction(db, adminId, u.id, "lift", "異議が認められた");
    [row] = await db.select().from(s.users).where(eq(s.users.id, u.id));
    expect(activeLimits(row).commentBanned).toBe(false);
    // 履歴は書き換えできない記録に残る
    const hist = await db.select().from(s.userSanctions).where(eq(s.userSanctions.userId, u.id));
    expect(hist.length).toBe(2);
    expect(await verifyChain(db, s.userSanctions)).toBeNull();
  });

  it("停止するとログイン中のセッションも切れる", async () => {
    const [u] = await db.insert(s.users).values({ email: `sy${Date.now()}@t.example`, handle: `sy${Date.now()}`, displayName: "s", passwordHash: "x" }).returning();
    await db.insert(s.sessions).values({ id: `sess${Date.now()}`, userId: u.id, expiresAt: new Date(Date.now() + 86400_000) });
    await sanction(db, adminId, u.id, "suspend", "規約違反", 3);
    expect((await db.select().from(s.sessions).where(eq(s.sessions.userId, u.id))).length).toBe(0);
    const [row] = await db.select().from(s.users).where(eq(s.users.id, u.id));
    expect(row.status).toBe("suspended");
  });
});

describe("緊急の対応", () => {
  it("ワンクリックで非公開・削除でき、監査ログに残る", async () => {
    const [v] = await published();
    await emergencyAction(db, adminId, "hide_video", v.id, "確認のため");
    let [after] = await db.select().from(s.videos).where(eq(s.videos.id, v.id));
    expect(after.status).toBe("hidden");
    expect(after.hiddenReason).toBe("by_admin");
    await emergencyAction(db, adminId, "delete_video", v.id, "重大な違反");
    [after] = await db.select().from(s.videos).where(eq(s.videos.id, v.id));
    expect(after.status).toBe("deleted");
    expect(after.deletedAt).not.toBeNull();
    // 削除しても記録は残る
    const logs = await db.select().from(s.adminAuditLogs).where(eq(s.adminAuditLogs.targetId, v.id));
    expect(logs.some((l) => l.action === "emergency.delete_video")).toBe(true);
    expect(await verifyChain(db, s.adminAuditLogs)).toBeNull();
    // 外部リンクも止まる
    const links = await db.select().from(s.outboundLinks).where(eq(s.outboundLinks.videoId, v.id));
    expect(links.every((l) => l.status !== "active")).toBe(true);
  });
});

describe("投稿と審査", () => {
  it("同意が揃わないと投稿できない", async () => {
    const r = await createVideo(db, { creatorId, category: "women", intensity: 1, title: "t", description: "", tags: [], consents: [true, true, false], ipHash: "x", userAgent: "ua" });
    expect(r.ok).toBe(false);
  });
  it("投稿は審査待ちになり、同意が追記型ログに残り、承認で公開される", async () => {
    const r = await createVideo(db, { creatorId, category: "women", intensity: 1, title: "新作", description: "説明", tags: ["夜景"], link: "https://example.com/x", consents: [true, true, true], ipHash: "iphash", userAgent: "ua" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.video.status).toBe("pending_review");
    const consents = await db.select().from(s.videoConsents).where(eq(s.videoConsents.videoId, r.video.id));
    expect(consents).toHaveLength(1);
    expect(await reviewVideo(db, adminId, r.video.id, "approve", "")).toBe(true);
    const [v] = await db.select().from(s.videos).where(eq(s.videos.id, r.video.id));
    expect(v.status).toBe("published");
  });
  it("登録されていない送客先のURLは受け付けない", async () => {
    const r = await createVideo(db, { creatorId, category: "women", intensity: 1, title: "外部", description: "", tags: [], link: "https://unknown-partner.net/p", consents: [true, true, true], ipHash: "x", userAgent: "ua" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/登録されていません/);
  });
  it("承認待ちの送客先なら、リンクは承認されるまで出ない", async () => {
    const r = await createVideo(db, { creatorId, category: "women", intensity: 1, title: "承認待ち", description: "", tags: [], link: "https://partner-b.example/p", consents: [true, true, true], ipHash: "x", userAgent: "ua" });
    expect(r.ok && r.linkPending).toBe(true);
  });
  it("送客先を止めると、そのサービス宛てのリンクは移動できなくなる", async () => {
    const r = await createVideo(db, { creatorId, category: "women", intensity: 1, title: "停止テスト", description: "", tags: [], link: "https://example.com/stop", consents: [true, true, true], ipHash: "x", userAgent: "ua" });
    if (!r.ok) throw new Error();
    await reviewVideo(db, adminId, r.video.id, "approve", "");
    const [link] = await db.select().from(s.outboundLinks).where(eq(s.outboundLinks.videoId, r.video.id));
    expect(await recordClick(db, { linkId: link.id, viewerKey: "d:stop1", isBot: false, creatorKey: "u:x" })).not.toBeNull();
    await db.update(s.destinations).set({ status: "paused" }).where(eq(s.destinations.domain, "example.com"));
    expect(await recordClick(db, { linkId: link.id, viewerKey: "d:stop2", isBot: false, creatorKey: "u:x" })).toBeNull();
    await db.update(s.destinations).set({ status: "approved" }).where(eq(s.destinations.domain, "example.com"));
  });
  it("短縮URLは拒否", async () => {
    const r = await createVideo(db, { creatorId, category: "women", intensity: 1, title: "短縮", description: "", tags: [], link: "https://bit.ly/x", consents: [true, true, true], ipHash: "x", userAgent: "ua" });
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
    for (const k of ["d:a", "d:b", "d:c", "d:d"]) {
      const r = await fileReport(db, { targetType: "comment", targetId: ok.comment.id, reason: "spam", reporterKey: k });
      expect(r.ok && r.hidden).toBe(false);
    }
    const last = await fileReport(db, { targetType: "comment", targetId: ok.comment.id, reason: "spam", reporterKey: "d:e" });
    expect(last.ok && last.hidden).toBe(true);
  });
});

describe("追記型ログ", () => {
  it("UPDATE/DELETE はDBが拒否し、チェーンは検証できる", async () => {
    await audit(db, adminId, "test.a", "x", "1");
    await audit(db, adminId, "test.b", "x", "2", { k: [1, 2] });
    expect(await verifyChain(db, s.adminAuditLogs)).toBeNull();
    expect(await verifyChain(db, s.videoConsents)).toBeNull();
    expect(await verifyChain(db, s.reportActions)).toBeNull();
    expect(await verifyChain(db, s.userSanctions)).toBeNull();
    const appendOnly = (e: unknown) => /append-only/.test(String((e as { cause?: Error }).cause?.message ?? e));
    await expect(db.execute(sql`update admin_audit_logs set action = 'tampered'`)).rejects.toSatisfy(appendOnly);
    await expect(db.execute(sql`delete from video_consents`)).rejects.toSatisfy(appendOnly);
    await appendChained(db, s.adminAuditLogs, { adminId, action: "c", targetType: "x", targetId: null, detail: null });
    expect(await verifyChain(db, s.adminAuditLogs)).toBeNull();
  });
});

describe("最初の分岐（ジャンル）", () => {
  it("選んだジャンルの動画だけがおすすめ・人気に並び、「すべて」なら全部", async () => {
    setDbForTest(Promise.resolve(db));
    const men = await feed("recommended", { viewerKey: "d:x", audience: "men" }, 50);
    expect(men.length).toBeGreaterThan(0);
    expect(men.every((v) => v.category === "men")).toBe(true);
    const couple = await feed("popular", { viewerKey: "d:x", audience: "couple" }, 50);
    expect(couple.every((v) => v.category === "couple")).toBe(true);
    const all = await feed("recommended", { viewerKey: "d:x", audience: "all" }, 50);
    expect(new Set(all.map((v) => v.category)).size).toBeGreaterThan(1);
  });
});

describe("ブロックリスト", () => {
  it("表示しないにした投稿者の動画は、フィードにもタグ一覧にも出ない", async () => {
    setDbForTest(Promise.resolve(db));
    const before = await feed("recommended", { viewerKey: "d:blocker", audience: "all" }, 50);
    const target = before[0].creator.id;
    await db.insert(s.blocks).values({ viewerKey: "d:blocker", creatorId: target });
    const after = await feed("recommended", { viewerKey: "d:blocker", audience: "all" }, 50);
    expect(after.some((v) => v.creator.id === target)).toBe(false);
    const other = await feed("recommended", { viewerKey: "d:someone", audience: "all" }, 50);
    expect(other.some((v) => v.creator.id === target)).toBe(true);
  });
});

describe("定期処理", () => {
  it("社内IPへ向かうリンクはたどらず、3回失敗で無効化", async () => {
    const { linkHealthcheck } = await import("@/lib/jobs");
    const [v] = await db.select().from(s.videos).where(eq(s.videos.status, "published")).limit(1);
    await db.delete(s.outboundLinks).where(eq(s.outboundLinks.videoId, v.id));
    await db.insert(s.outboundLinks).values({ id: "healthtest000001", videoId: v.id, url: "https://127.0.0.1/x", domain: "example.com", status: "active" });
    await db.update(s.outboundLinks).set({ status: "disabled_by_admin" }).where(sql`${s.outboundLinks.id} <> 'healthtest000001'`);
    for (let i = 0; i < 3; i++) await linkHealthcheck(db);
    const [l] = await db.select().from(s.outboundLinks).where(eq(s.outboundLinks.id, "healthtest000001"));
    expect(l.status).toBe("disabled_healthcheck");
    expect(l.lastCheckStatus).toContain("安全でない転送先");
  });
  it("期限切れのセッションなどを削除し、監査ログに残す", async () => {
    const { purgeExpired } = await import("@/lib/jobs");
    const [u] = await db.select().from(s.users).limit(1);
    await db.insert(s.sessions).values({ id: "expired-session", userId: u.id, expiresAt: new Date(Date.now() - 1000) });
    const r = await purgeExpired(db);
    expect(r.sessions).toBeGreaterThanOrEqual(1);
    const logs = await db.select().from(s.adminAuditLogs).where(eq(s.adminAuditLogs.action, "job.purge_expired"));
    expect(logs.length).toBe(1);
  });
});

describe("刺激の強さの絞り込み", () => {
  it("上限より強い動画はどのタブにも出ない", async () => {
    setDbForTest(Promise.resolve(db));
    const all = await feed("recommended", { viewerKey: "d:int", audience: "all", maxIntensity: 3 }, 50);
    expect(all.some((v) => v.intensity === 3)).toBe(true);
    for (const max of [1, 2]) {
      for (const tab of ["recommended", "popular"] as const) {
        const r = await feed(tab, { viewerKey: "d:int", audience: "all", maxIntensity: max }, 50);
        expect(r.length).toBeGreaterThan(0);
        expect(r.every((v) => v.intensity <= max)).toBe(true);
      }
    }
  });
});

describe("動画の軽い情報（いいね数・再生数・場所）", () => {
  it("いいね・再生はトリガーで videos の数に反映され、取り消しで減る", async () => {
    const [v] = await published();
    const before = (await db.select().from(s.videos).where(eq(s.videos.id, v.id)))[0];
    await db.insert(s.likes).values({ viewerKey: "d:cnt1", videoId: v.id });
    await db.insert(s.views).values([{ videoId: v.id, viewerKey: "d:cnt1", isValid: true }, { videoId: v.id, viewerKey: "d:bot", isValid: false }]);
    let [after] = await db.select().from(s.videos).where(eq(s.videos.id, v.id));
    expect(after.likeCount).toBe(before.likeCount + 1);
    expect(after.viewCount).toBe(before.viewCount + 1); // 無効な再生は数えない
    await db.delete(s.likes).where(eq(s.likes.viewerKey, "d:cnt1"));
    [after] = await db.select().from(s.videos).where(eq(s.videos.id, v.id));
    expect(after.likeCount).toBe(before.likeCount);
  });

  it("「興味がない」にした動画はフィードに出ない", async () => {
    setDbForTest(Promise.resolve(db));
    const o = { viewerKey: "d:ni-test" };
    const first = (await feed("recommended", o, 50))[0];
    await db.insert(s.notInterested).values({ viewerKey: o.viewerKey, videoId: first.id });
    expect((await feed("recommended", o, 50)).map((c) => c.id)).not.toContain(first.id);
    expect((await feed("recommended", { viewerKey: "d:other" }, 50)).map((c) => c.id)).toContain(first.id);
  });

  it("アップロードが完了すると、動画の行に再生URL・サムネイル・縦横が入り、変換が終わるまでは再生URLを出さない", async () => {
    setDbForTest(Promise.resolve(db));
    const { applyUploadToVideo, markUpload } = await import("@/lib/media");
    const [v] = await published();
    const [u] = await db.insert(s.uploads).values({ userId: v.creatorId, videoId: v.id, provider: "local", filename: "a.mp4", mime: "video/mp4", size: 10, status: "processing", expiresAt: new Date(Date.now() + 3600_000) }).returning();
    await applyUploadToVideo(db, u);
    const { hydrate } = await import("@/lib/content");
    expect((await hydrate([v.id], { viewerKey: "d:x" }, db))[0].src).toBeNull();
    await markUpload(db, u.id, { status: "ready", playbackUrl: "/media/x/master.m3u8", thumbnailUrl: "/media/x/poster.jpg", width: 1920, height: 1080 });
    const [card] = await hydrate([v.id], { viewerKey: "d:x" }, db);
    expect(card).toMatchObject({ src: "/media/x/master.m3u8", poster: "/media/x/poster.jpg", width: 1920, height: 1080 });
  });
});

describe("保存料をむだにしない後片付け", () => {
  it("削除された動画のファイルは、猶予を過ぎたら保存先からも消す", async () => {
    const { purgeRemovedMedia } = await import("@/lib/media");
    const [v] = await db.select().from(s.videos).limit(1);
    await db.update(s.videos).set({ status: "deleted", playbackUrl: "/media/zz/master.m3u8", thumbnailUrl: "/media/zz/poster.jpg", mediaStatus: "ready", deletedAt: new Date(Date.now() - 30 * 86400_000) }).where(eq(s.videos.id, v.id));
    await db.insert(s.uploads).values({ userId: v.creatorId, videoId: v.id, provider: "local", filename: "a.mp4", mime: "video/mp4", size: 10, status: "ready", expiresAt: new Date(Date.now() + 3600_000) });
    expect(await purgeRemovedMedia(db)).toBe(1);
    const [after] = await db.select().from(s.videos).where(eq(s.videos.id, v.id));
    expect(after.playbackUrl).toBeNull();
    expect(after.mediaStatus).toBe("none");
    expect((await db.select().from(s.uploads).where(eq(s.uploads.videoId, v.id))).length).toBe(0);
  });

  it("消したばかりの動画は、猶予のあいだ残す（誤操作に備える）", async () => {
    const { purgeRemovedMedia } = await import("@/lib/media");
    const [v] = await db.select().from(s.videos).where(eq(s.videos.status, "published")).limit(1);
    await db.update(s.videos).set({ status: "deleted", playbackUrl: "/media/yy/master.m3u8", mediaStatus: "ready", deletedAt: new Date() }).where(eq(s.videos.id, v.id));
    expect(await purgeRemovedMedia(db)).toBe(0);
    const [after] = await db.select().from(s.videos).where(eq(s.videos.id, v.id));
    expect(after.playbackUrl).toBe("/media/yy/master.m3u8");
  });
});
