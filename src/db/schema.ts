import {
  pgTable, text, uuid, timestamp, boolean, integer, jsonb, primaryKey, serial, bigserial, bigint, index, uniqueIndex,
} from "drizzle-orm/pg-core";

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const ts = () => timestamp({ withTimezone: true });

/* ---------- ユーザー ---------- */
/** 年齢の状態。成人向けを出してよいかの判断に使う */
export const AGE_STATUS = ["unknown", "age_verified", "age_restricted"] as const;
export type AgeStatus = (typeof AGE_STATUS)[number];

export const ROLES = ["user", "super_admin", "reviewer", "report_handler"] as const;
export type Role = (typeof ROLES)[number];

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull(),
  passwordHash: text().notNull(),
  handle: text().notNull(),
  displayName: text().notNull(),
  role: text().$type<Role>().notNull().default("user"),
  status: text().$type<"active" | "suspended" | "banned" | "deleted">().notNull().default("active"),
  emailVerifiedAt: ts(),
  totpSecret: text(),
  totpEnabled: boolean().notNull().default(false),
  avatarHue: integer().notNull().default(280),
  /** プロフィール写真。小さく縮めた画像を data URL で持つ（オブジェクトストレージに移すのは後） */
  avatarUrl: text(),
  /** プロフィールの自己紹介（全員が持てる。投稿者申請の文面とは別） */
  bio: text().notNull().default(""),
  /** 年齢の状態。unknown=未確認 / age_verified=成人として確認済み / age_restricted=成人向けを見せない */
  ageStatus: text().$type<AgeStatus>().notNull().default("unknown"),
  /** 期限つきの措置。過ぎたら自動的に解ける */
  postBannedUntil: ts(),
  commentBannedUntil: ts(),
  suspendedUntil: ts(),
  createdAt: now(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email), uniqueIndex("users_handle_uq").on(t.handle)]);

export const sessions = pgTable("sessions", {
  id: text().primaryKey(), // トークンのSHA-256
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  mfaVerified: boolean().notNull().default(false),
  createdAt: now(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

export const emailTokens = pgTable("email_tokens", {
  id: text().primaryKey(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text().$type<"verify" | "reset">().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

export const userPreferences = pgTable("user_preferences", {
  userId: uuid().primaryKey().references(() => users.id, { onDelete: "cascade" }),
  theme: jsonb().notNull(),
  preferredTags: jsonb().$type<string[]>().notNull().default([]),
  audience: text().$type<"women" | "men" | "couple" | "all">().notNull().default("all"),
  /** 刺激の強さの上限（1=ソフト〜3=ハード）。これより強い動画はフィードに出さない */
  maxIntensity: integer().notNull().default(3),
  updatedAt: now(),
});

/* ---------- 年齢確認 ---------- */
export const ageGateSessions = pgTable("age_gate_sessions", {
  id: uuid().primaryKey().defaultRandom(),
  gateVersion: integer().notNull(),
  uaHash: text(),
  acceptedAt: now(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

/* ---------- 投稿者 ---------- */
export const CREATOR_STATUS = ["pending", "approved", "rejected", "suspended", "banned"] as const;
export type CreatorStatus = (typeof CREATOR_STATUS)[number];

export const creatorProfiles = pgTable("creator_profiles", {
  userId: uuid().primaryKey().references(() => users.id, { onDelete: "cascade" }),
  status: text().$type<CreatorStatus>().notNull().default("pending"),
  bio: text().notNull().default(""),
  /**
   * 申請のときに登録した送客先と、自分のアフィリエイトURL。
   * 「実際に自分の販売ページを持っている人だけ投稿者にする」ための入口の条件。
   */
  destinationId: uuid().references(() => destinations.id, { onDelete: "set null" }),
  affiliateUrl: text(),
  approvedPosts: integer().notNull().default(0),
  violationPoints: integer().notNull().default(0),
  restrictedUntil: ts(),
  appliedAt: now(),
  approvedAt: ts(),
});

/**
 * 投稿者が登録したアフィリエイト（サイト名＋ID）。いくつでも足せる。
 * いちど登録したものは原則変えられない（後から別人のIDに差し替える不正を防ぐため）。
 * 変更が必要なときは問い合わせから運営が対応する。
 */
export const creatorAffiliates = pgTable("creator_affiliates", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  destinationId: uuid().notNull().references(() => destinations.id, { onDelete: "restrict" }),
  /** そのサービスでのアフィリエイトID（会員IDやサイトIDなど） */
  affiliateId: text().notNull(),
  /** 運営が止めたとき（なりすましの申告があった場合など） */
  status: text().$type<"active" | "disabled">().notNull().default("active"),
  createdAt: now(),
}, (t) => [
  uniqueIndex("creator_affiliates_uq").on(t.destinationId, t.affiliateId),
  index("creator_affiliates_user_idx").on(t.userId),
]);

/**
 * 🔒 追記専用（トリガーで UPDATE/DELETE 禁止）
 *
 * 投稿者になるときに同意した内容の記録。
 * 「いつ・どの文面に・どの端末から同意したか」を、後から書き換えられない形で残す。
 * 問題が起きたときに、本人が何に同意していたかを示せるようにするため。
 */
export const creatorAttestations = pgTable("creator_attestations", {
  id: bigserial({ mode: "number" }).primaryKey(),
  userId: uuid().notNull(),
  /** 同意した文面の版。文面を変えたら上げる */
  version: integer().notNull(),
  /** 同意した文面そのもののハッシュ（文面が後から差し替えられていないことの裏付け） */
  textHash: text().notNull(),
  /** チェックした項目のキー */
  items: jsonb().$type<string[]>().notNull(),
  ipHash: text().notNull(),
  userAgent: text().notNull(),
  createdAt: now(),
  prevHash: text().notNull(),
  rowHash: text().notNull(),
});

export const creatorPenalties = pgTable("creator_penalties", {
  id: bigserial({ mode: "number" }).primaryKey(),
  creatorId: uuid().notNull(),
  level: text().$type<"warning" | "restriction" | "suspension" | "ban" | "lift">().notNull(),
  reason: text().notNull(),
  endsAt: ts(),
  adminId: uuid().notNull(),
  createdAt: now(),
  prevHash: text().notNull(),
  rowHash: text().notNull(),
});

/* ---------- 動画（今は抽象プレースホルダーのみ。実ファイルは後のフェーズ） ---------- */
/**
 * 動画の状態。アップロードから公開・削除までを1本の流れで表す。
 * 飛ばしてはいけない遷移は src/lib/video-state.ts の表で禁止している。
 */
export const VIDEO_STATUS = [
  "draft",          // 下書き（まだ送信していない）
  "uploading",      // ファイル送信中
  "processing",     // 変換中（HLS化）
  "pending_review", // 審査待ち
  "approved",       // 審査通過（公開直前）
  "published",      // 公開中
  "hidden",         // 非公開（理由は hiddenReason）
  "rejected",       // 差し戻し
  "deleted",        // 削除済み（行は残し、ファイルだけ消す）
] as const;
export type VideoStatus = (typeof VIDEO_STATUS)[number];

/** 非公開になった理由。誰が下げたのかを残す */
export const HIDDEN_REASONS = ["by_creator", "by_report", "by_admin", "by_system"] as const;
export type HiddenReason = (typeof HIDDEN_REASONS)[number];

export const videos = pgTable("videos", {
  id: uuid().primaryKey().defaultRandom(),
  creatorId: uuid().notNull().references(() => users.id),
  title: text().notNull(),
  description: text().notNull().default(""),
  status: text().$type<VideoStatus>().notNull().default("pending_review"),
  statusReason: text(),
  /** status が hidden のとき、誰が下げたか */
  hiddenReason: text().$type<HiddenReason>(),
  /** 審査を通ったあと、公開するか自分だけにするか（TikTokの「この動画を見られる人」） */
  visibility: text().$type<"public" | "private">().notNull().default("public"),
  /** 表紙に使う位置（ミリ秒）。投稿者が動画の中から選ぶ */
  coverTimeMs: integer(),
  /** 審査を通した日時（approved に入った時刻） */
  approvedAt: ts(),
  /** 削除した日時（ファイルの片付けの起点） */
  deletedAt: ts(),
  hue: jsonb().$type<[number, number, number]>().notNull(),
  baseLikes: integer().notNull().default(0),
  /** 最初の分岐（女性・男性・カップル）。フィードの絞り込みに使う */
  category: text().$type<"women" | "men" | "couple">().notNull().default("women"),
  /** 刺激の強さ（1=ソフト・2=ミディアム・3=ハード）。投稿者が選び、審査で確認する */
  intensity: integer().notNull().default(1),
  reviewRequired: boolean().notNull().default(true),
  commentsEnabled: boolean().notNull().default(true),
  /*
   * 動画本体はDBに入れない。DBには「場所」と軽い情報だけを持ち、実ファイルはオブジェクトストレージ、配信はCDN。
   * 一覧：スマホ → API → DB（このテーブル）／ 本体：スマホ → CDN（playbackUrl）
   */
  /** 再生URL（HLSのマスタープレイリスト .m3u8、または MP4）。未アップロードなら null */
  playbackUrl: text(),
  /** サムネイル画像のURL */
  thumbnailUrl: text(),
  /** 縦横のピクセル数（横長の動画は切らずに全体を表示するため） */
  width: integer(),
  height: integer(),
  durationMs: integer(),
  /** 動画ファイルの状態 none=未登録 / processing=変換中 / ready=再生可能 / failed=失敗 */
  mediaStatus: text().$type<"none" | "processing" | "ready" | "failed">().notNull().default("none"),
  /** いいね数・再生数（likes / views への追加・削除時にDBトリガーで増減する。一覧で数え直さないため） */
  likeCount: integer().notNull().default(0),
  viewCount: integer().notNull().default(0),
  publishedAt: ts(),
  createdAt: now(),
}, (t) => [
  // 最新の動画
  index("videos_status_idx").on(t.status, t.publishedAt),
  index("videos_category_idx").on(t.category, t.status),
  // 特定ユーザーの動画
  index("videos_creator_idx").on(t.creatorId, t.publishedAt),
]);

/**
 * 大きな動画のチャンク（分割）アップロード。tus 方式で、途中で切れても続きから再開できる。
 * provider=local：このサーバーが受け取り、ffmpeg があれば HLS（複数画質）に変換
 * provider=bunny：Bunny Stream に直接アップロード（変換・CDN配信は Bunny 側）
 */
export const uploads = pgTable("uploads", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  videoId: uuid().references(() => videos.id, { onDelete: "set null" }),
  provider: text().$type<"local" | "bunny">().notNull(),
  /** 外部サービス側のID（Bunny の動画GUIDなど） */
  providerRef: text(),
  filename: text().notNull(),
  mime: text().notNull(),
  size: bigint({ mode: "number" }).notNull(),
  /** 受け取り済みのバイト数（local のみ。再開位置） */
  received: bigint({ mode: "number" }).notNull().default(0),
  status: text().$type<"uploading" | "processing" | "ready" | "failed">().notNull().default("uploading"),
  playbackUrl: text(),
  thumbnailUrl: text(),
  width: integer(),
  height: integer(),
  durationMs: integer(),
  /** 表紙に選んだ位置（ミリ秒） */
  coverTimeMs: integer(),
  /** 切り取り（トリミング）の範囲。null は切り取らない。変換のときに実際に切る */
  trimStartMs: integer(),
  trimEndMs: integer(),
  error: text(),
  createdAt: now(),
  updatedAt: now(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
}, (t) => [index("uploads_user_idx").on(t.userId, t.createdAt), index("uploads_video_idx").on(t.videoId)]);

export const TAG_STATUS = ["approved", "pending", "rejected"] as const;
export type TagStatus = (typeof TAG_STATUS)[number];

export const tags = pgTable("tags", {
  id: serial().primaryKey(),
  slug: text().notNull(),
  name: text().notNull(),
  /**
   * 投稿者が自由に作ったタグは pending から始める。
   * 動画には付くが、候補一覧や検索には出さない（運営が見てから広げる）。
   */
  status: text().$type<TagStatus>().notNull().default("approved"),
  /** 誰が作ったか（運営が見るときの手がかり。既定のタグは null） */
  createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  createdAt: now(),
}, (t) => [uniqueIndex("tags_name_uq").on(t.name), index("tags_status_idx").on(t.status)]);

export const videoTags = pgTable("video_tags", {
  videoId: uuid().notNull().references(() => videos.id, { onDelete: "cascade" }),
  tagId: integer().notNull().references(() => tags.id),
}, (t) => [primaryKey({ columns: [t.videoId, t.tagId] })]);

/** 🔒 追記専用（トリガーで UPDATE/DELETE 禁止） */
export const videoConsents = pgTable("video_consents", {
  id: bigserial({ mode: "number" }).primaryKey(),
  videoId: uuid().notNull(),
  creatorId: uuid().notNull(),
  consentVersion: integer().notNull(),
  consentTextHash: text().notNull(),
  ownsRights: boolean().notNull(),
  performersAdultConsented: boolean().notNull(),
  notReposted: boolean().notNull(),
  ipHash: text().notNull(),
  userAgent: text().notNull(),
  createdAt: now(),
  prevHash: text().notNull(),
  rowHash: text().notNull(),
});

export const videoReviews = pgTable("video_reviews", {
  id: bigserial({ mode: "number" }).primaryKey(),
  videoId: uuid().notNull(),
  adminId: uuid().notNull(),
  decision: text().$type<"approve" | "reject">().notNull(),
  note: text(),
  createdAt: now(),
});

/* ---------- 視聴者の行動 ---------- */
// viewerKey は "u:<userId>"（ログイン）か "d:<端末ID>"（未ログイン）
export const likes = pgTable("likes", {
  viewerKey: text().notNull(),
  videoId: uuid().notNull().references(() => videos.id, { onDelete: "cascade" }),
  createdAt: now(),
}, (t) => [primaryKey({ columns: [t.viewerKey, t.videoId] })]);

export const favorites = pgTable("favorites", {
  viewerKey: text().notNull(),
  videoId: uuid().notNull().references(() => videos.id, { onDelete: "cascade" }),
  createdAt: now(),
}, (t) => [primaryKey({ columns: [t.viewerKey, t.videoId] })]);

/** 「この投稿者を表示しない」（ブロックリスト）。未ログインは端末ごと、ログイン中はアカウントごと */
export const blocks = pgTable("blocks", {
  viewerKey: text().notNull(),
  creatorId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: now(),
}, (t) => [primaryKey({ columns: [t.viewerKey, t.creatorId] })]);

/** 「興味がない」にした動画（フィードに出さない） */
export const notInterested = pgTable("not_interested", {
  viewerKey: text().notNull(),
  videoId: uuid().notNull().references(() => videos.id, { onDelete: "cascade" }),
  createdAt: now(),
}, (t) => [primaryKey({ columns: [t.viewerKey, t.videoId] })]);

export const follows = pgTable("follows", {
  followerId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  creatorId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: now(),
}, (t) => [primaryKey({ columns: [t.followerId, t.creatorId] })]);

export const views = pgTable("views", {
  id: bigserial({ mode: "number" }).primaryKey(),
  videoId: uuid().notNull().references(() => videos.id, { onDelete: "cascade" }),
  viewerKey: text().notNull(),
  isValid: boolean().notNull(),
  createdAt: now(),
}, (t) => [index("views_video_idx").on(t.videoId, t.createdAt)]);

/* ---------- 本人・年齢の確認 ---------- */
/** 確認のやり方。法令や決済会社の要求に合わせて差し替えられるよう、方式を値で持つ */
export const VERIFY_METHODS = ["self_declared", "document_manual", "ekyc"] as const;
export type VerifyMethod = (typeof VERIFY_METHODS)[number];
export const VERIFY_STATUS = ["none", "pending", "verified", "rejected", "expired"] as const;
export type VerifyStatus = (typeof VERIFY_STATUS)[number];

/**
 * 投稿者の確認結果。
 * 【プライバシー】本人確認書類の画像そのものは保存しない。保存するのは
 * 「確認した結果・いつ・誰が・どの方式で」だけ。生年月日は年齢の裏付けに必要なため持つが、
 * 閲覧できるのは運営の権限者のみで、退会時と保存期限（retentionUntil）経過時に消す。
 */
export const creatorVerifications = pgTable("creator_verifications", {
  userId: uuid().primaryKey().references(() => users.id, { onDelete: "cascade" }),
  method: text().$type<VerifyMethod>().notNull().default("self_declared"),
  status: text().$type<VerifyStatus>().notNull().default("none"),
  /** 生年月日（投稿者のみ・運営の権限者のみ閲覧） */
  birthDate: text(),
  /** 18歳以上であることを確認できたか */
  isAdult: boolean().notNull().default(false),
  verifiedAt: ts(),
  verifiedBy: uuid(),
  rejectedReason: text(),
  /** 次の確認が必要になる日（方式によっては期限を設ける） */
  expiresAt: ts(),
  /** この日を過ぎたら生年月日を消す（結果だけ残す） */
  retentionUntil: ts(),
  createdAt: now(),
  updatedAt: now(),
});

/* ---------- 利用者への措置 ---------- */
export const SANCTION_KINDS = ["warning", "post_ban", "comment_ban", "suspend", "ban", "lift"] as const;
export type SanctionKind = (typeof SANCTION_KINDS)[number];

/** 🔒 追記専用。投稿者だけでなく、一般の利用者への措置もここに残す */
export const userSanctions = pgTable("user_sanctions", {
  id: bigserial({ mode: "number" }).primaryKey(),
  userId: uuid().notNull(),
  kind: text().$type<SanctionKind>().notNull(),
  reason: text().notNull(),
  /** 期限つきの措置の終わり。null なら無期限 */
  endsAt: ts(),
  adminId: uuid().notNull(),
  /** きっかけになった案件 */
  caseId: uuid(),
  createdAt: now(),
  prevHash: text().notNull(),
  rowHash: text().notNull(),
}, (t) => [index("sanctions_user_idx").on(t.userId, t.createdAt)]);

/* ---------- コメント ---------- */
export const comments = pgTable("comments", {
  id: uuid().primaryKey().defaultRandom(),
  videoId: uuid().notNull().references(() => videos.id, { onDelete: "cascade" }),
  userId: uuid().notNull().references(() => users.id),
  body: text().notNull(),
  /** 返信のとき、返信先のコメント（1段だけ。TikTokと同じく返信への返信も同じ階層に並べる） */
  parentId: uuid().$type<string | null>(),
  status: text().$type<"visible" | "pending" | "hidden_by_report" | "hidden_by_creator" | "removed">().notNull().default("visible"),
  /** コメントへのいいね数（comment_likes の増減をトリガーで反映） */
  likeCount: integer().notNull().default(0),
  createdAt: now(),
}, (t) => [index("comments_video_idx").on(t.videoId, t.createdAt), index("comments_parent_idx").on(t.parentId)]);

/** コメントへのいいね */
export const commentLikes = pgTable("comment_likes", {
  viewerKey: text().notNull(),
  commentId: uuid().notNull().references(() => comments.id, { onDelete: "cascade" }),
  createdAt: now(),
}, (t) => [primaryKey({ columns: [t.viewerKey, t.commentId] })]);

export const commentReports = pgTable("comment_reports", {
  id: bigserial({ mode: "number" }).primaryKey(),
  commentId: uuid().notNull().references(() => comments.id, { onDelete: "cascade" }),
  reason: text().notNull(),
  reporterKey: text().notNull(),
  createdAt: now(),
}, (t) => [uniqueIndex("comment_reports_once").on(t.commentId, t.reporterKey)]);

/* ---------- 通報 ---------- */
/* ---------- 通報 ---------- */
/** 通報できる対象 */
export const REPORT_TARGETS = ["video", "profile", "comment"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

/**
 * 通報の理由。上の5つは被害が重く、取り返しがつかないため最優先で扱う。
 * 文言は src/lib/report-reasons.ts に置き、画面と管理画面で共通に使う。
 */
export const REPORT_REASONS = [
  "minor_suspected",     // 未成年の疑い
  "no_consent",          // 本人の同意がない
  "voyeurism",           // 盗撮の疑い
  "revenge_porn",        // リベンジポルノ等の疑い
  "illegal",             // 違法コンテンツ
  "unauthorized_repost", // 無断掲載
  "copyright",           // 著作権侵害
  "harassment",          // 嫌がらせ
  "spam",                // スパム
  "other",               // その他
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REPORT_STATUS = ["open", "in_progress", "resolved_removed", "resolved_restored", "dismissed", "duplicate"] as const;
export type ReportStatus = (typeof REPORT_STATUS)[number];

/** 動画・プロフィール・コメントのすべての通報が入る */
export const reports = pgTable("reports", {
  id: uuid().primaryKey().defaultRandom(),
  targetType: text().$type<ReportTarget>().notNull(),
  targetId: uuid().notNull(),
  /** 対象の持ち主（審査と集計を速くするための控え） */
  ownerId: uuid(),
  reason: text().$type<ReportReason>().notNull(),
  description: text(),
  /** 通報した人。ログインしていなければ端末キー。氏名などは集めない */
  reporterKey: text().notNull(),
  reporterId: uuid().references(() => users.id, { onDelete: "set null" }),
  priority: text().$type<Priority>().notNull(),
  status: text().$type<ReportStatus>().notNull().default("open"),
  /** 対応の期限。重いものほど短い */
  slaDueAt: timestamp({ withTimezone: true }).notNull(),
  /** 受け付けた時点で自動的に非公開にしたか */
  autoActioned: boolean().notNull().default(false),
  createdAt: now(),
  updatedAt: now(),
  resolvedAt: ts(),
}, (t) => [
  // 同じ人が同じ対象を何度も通報しても1件として扱う
  uniqueIndex("reports_once").on(t.targetType, t.targetId, t.reporterKey),
  index("reports_queue_idx").on(t.status, t.priority, t.createdAt),
  index("reports_target_idx").on(t.targetType, t.targetId),
]);

export const reportTickets = pgTable("report_tickets", {
  id: uuid().primaryKey().defaultRandom(),
  videoId: uuid().notNull().references(() => videos.id),
  reason: text().$type<ReportReason>().notNull(),
  detail: text(),
  reporterKey: text().notNull(),
  priority: text().$type<"P0" | "P1" | "P2">().notNull(),
  slaDueAt: timestamp({ withTimezone: true }).notNull(),
  status: text().$type<"open" | "resolved_restored" | "resolved_removed" | "dismissed">().notNull().default("open"),
  autoHidden: boolean().notNull().default(false),
  createdAt: now(),
}, (t) => [uniqueIndex("report_once").on(t.videoId, t.reporterKey)]);

/** 🔒 追記専用 */
export const CASE_KINDS = ["video_review", "report", "appeal"] as const;
export type CaseKind = (typeof CASE_KINDS)[number];
export const CASE_STATUS = ["open", "in_progress", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUS)[number];

/**
 * 運営の作業ひとつぶん。審査待ちの動画も、通報も、異議申立もここに集まる。
 * 管理画面のダッシュボードはこの1テーブルを優先度順に並べるだけでよくなる。
 */
export const moderationCases = pgTable("moderation_cases", {
  id: uuid().primaryKey().defaultRandom(),
  kind: text().$type<CaseKind>().notNull(),
  targetType: text().$type<ReportTarget>().notNull(),
  targetId: uuid().notNull(),
  ownerId: uuid(),
  priority: text().$type<Priority>().notNull(),
  status: text().$type<CaseStatus>().notNull().default("open"),
  /** この案件のもとになった通報（通報由来のときだけ） */
  reportId: uuid(),
  /** 同じ対象への通報が重なった数 */
  reportCount: integer().notNull().default(0),
  assignedTo: uuid().references(() => users.id, { onDelete: "set null" }),
  dueAt: ts(),
  summary: text().notNull().default(""),
  outcome: text(),
  createdAt: now(),
  updatedAt: now(),
  closedAt: ts(),
}, (t) => [
  uniqueIndex("cases_open_target").on(t.targetType, t.targetId, t.kind),
  index("cases_queue_idx").on(t.status, t.priority, t.createdAt),
]);

export const reportActions = pgTable("report_actions", {
  id: bigserial({ mode: "number" }).primaryKey(),
  ticketId: uuid().notNull(),
  adminId: uuid(),
  action: text().notNull(),
  note: text(),
  createdAt: now(),
  prevHash: text().notNull(),
  rowHash: text().notNull(),
});

/* ---------- アフィリエイト ---------- */
export const DESTINATION_STATUS = ["pending", "approved", "paused", "rejected"] as const;
export type DestinationStatus = (typeof DESTINATION_STATUS)[number];

/**
 * 「完全版を見る」の送客先サービス（FANZA・myfans・Fanvue など）。
 * 投稿者が任意のURLを自由に貼れる形にはせず、運営が承認したサービスの中から選ぶ。
 * paused にすると、そのサービス宛てのリンクが一括で止まる。
 */
export const destinations = pgTable("destinations", {
  id: uuid().primaryKey().defaultRandom(),
  serviceName: text().notNull(),
  /** 許可するドメイン（このドメイン以外のURLは登録できない） */
  domain: text().notNull(),
  /** 代表URL（説明・確認用） */
  affiliateUrl: text().notNull().default(""),
  /** 投稿者のURLが満たすべき形。空なら同じドメインであればよい */
  urlPattern: text(),
  status: text().$type<DestinationStatus>().notNull().default("pending"),
  note: text(),
  approvedAt: ts(),
  approvedBy: uuid(),
  createdAt: now(),
  updatedAt: now(),
}, (t) => [uniqueIndex("destinations_domain_uq").on(t.domain)]);

export const affiliateDomains = pgTable("affiliate_domains", {
  id: serial().primaryKey(),
  domain: text().notNull(),
  displayName: text().notNull(),
  isActive: boolean().notNull().default(true),
  createdAt: now(),
}, (t) => [uniqueIndex("affiliate_domains_uq").on(t.domain)]);

export const outboundLinks = pgTable("outbound_links", {
  id: text().primaryKey(),
  videoId: uuid().notNull().references(() => videos.id, { onDelete: "cascade" }),
  /** どの送客先サービスか。ここが paused になると、このリンクも止まる */
  destinationId: uuid().references(() => destinations.id, { onDelete: "set null" }),
  url: text().notNull(),
  domain: text().notNull(),
  status: text().$type<"active" | "pending_domain_review" | "rejected" | "disabled_domain_removed" | "disabled_by_admin" | "disabled_healthcheck">().notNull(),
  lastCheckedAt: ts(),
  lastCheckStatus: text(),
  checkFailures: integer().notNull().default(0),
  createdAt: now(),
}, (t) => [uniqueIndex("outbound_links_video_uq").on(t.videoId)]);

/**
 * 送客のクリック。成果の分析に必要な分だけを持つ。
 * 【プライバシー】IPアドレス・位置情報・端末の細かい情報は保存しない。
 * viewerKey は重複クリックを除くための内部の識別子で、氏名などとは結び付かない。
 */
export const linkClicks = pgTable("link_clicks", {
  id: bigserial({ mode: "number" }).primaryKey(),
  /** 外部に出しても安全な、このクリック1回ぶんの番号（問い合わせの照合用） */
  clickId: text().notNull(),
  linkId: text().notNull(),
  videoId: uuid().notNull(),
  creatorId: uuid(),
  destinationId: uuid(),
  viewerKey: text().notNull(),
  isValid: boolean().notNull(),
  invalidReason: text(),
  createdAt: now(),
}, (t) => [
  index("link_clicks_idx").on(t.linkId, t.viewerKey, t.createdAt),
  uniqueIndex("link_clicks_click_uq").on(t.clickId),
  index("link_clicks_dest_idx").on(t.destinationId, t.createdAt),
  index("link_clicks_creator_idx").on(t.creatorId, t.createdAt),
]);

/* ---------- 運営 ---------- */
/** 🔒 追記専用 */
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: bigserial({ mode: "number" }).primaryKey(),
  adminId: uuid(),
  action: text().notNull(),
  targetType: text().notNull(),
  targetId: text(),
  detail: jsonb(),
  createdAt: now(),
  prevHash: text().notNull(),
  rowHash: text().notNull(),
});

/** 運営が手動で選ぶ特集枠（探す画面の上部） */
export const featuredSlots = pgTable("featured_slots", {
  id: serial().primaryKey(),
  videoId: uuid().notNull().references(() => videos.id, { onDelete: "cascade" }),
  title: text().notNull().default(""),
  position: integer().notNull().default(0),
  startsAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  endsAt: ts(),
  createdBy: uuid(),
  createdAt: now(),
});

export const siteSettings = pgTable("site_settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: now(),
});

export const takedownRequests = pgTable("takedown_requests", {
  id: uuid().primaryKey().defaultRandom(),
  receipt: text().notNull(),
  name: text().notNull(),
  email: text().notNull(),
  requesterType: text().notNull(),
  claimType: text().notNull(),
  targetUrl: text().notNull(),
  detail: text().notNull(),
  status: text().$type<"received" | "investigating" | "actioned" | "answered" | "rejected">().notNull().default("received"),
  createdAt: now(),
  updatedAt: now(),
});

export const notifications = pgTable("notifications", {
  id: bigserial({ mode: "number" }).primaryKey(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text().notNull(),
  body: text().notNull(),
  readAt: ts(),
  createdAt: now(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  windowStart: timestamp({ withTimezone: true }).notNull(),
});
