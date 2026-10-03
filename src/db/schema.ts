import {
  pgTable, text, uuid, timestamp, boolean, integer, jsonb, primaryKey, serial, bigserial, bigint, index, uniqueIndex,
} from "drizzle-orm/pg-core";

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const ts = () => timestamp({ withTimezone: true });

/* ---------- ユーザー ---------- */
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
  approvedPosts: integer().notNull().default(0),
  violationPoints: integer().notNull().default(0),
  restrictedUntil: ts(),
  appliedAt: now(),
  approvedAt: ts(),
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
export const VIDEO_STATUS = ["pending_review", "published", "rejected", "hidden_by_report", "hidden_by_creator", "removed"] as const;
export type VideoStatus = (typeof VIDEO_STATUS)[number];

export const videos = pgTable("videos", {
  id: uuid().primaryKey().defaultRandom(),
  creatorId: uuid().notNull().references(() => users.id),
  title: text().notNull(),
  description: text().notNull().default(""),
  status: text().$type<VideoStatus>().notNull().default("pending_review"),
  statusReason: text(),
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
  error: text(),
  createdAt: now(),
  updatedAt: now(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
}, (t) => [index("uploads_user_idx").on(t.userId, t.createdAt), index("uploads_video_idx").on(t.videoId)]);

export const tags = pgTable("tags", {
  id: serial().primaryKey(),
  slug: text().notNull(),
  name: text().notNull(),
}, (t) => [uniqueIndex("tags_name_uq").on(t.name)]);

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

/* ---------- コメント ---------- */
export const comments = pgTable("comments", {
  id: uuid().primaryKey().defaultRandom(),
  videoId: uuid().notNull().references(() => videos.id, { onDelete: "cascade" }),
  userId: uuid().notNull().references(() => users.id),
  body: text().notNull(),
  status: text().$type<"visible" | "pending" | "hidden_by_report" | "hidden_by_creator" | "removed">().notNull().default("visible"),
  createdAt: now(),
}, (t) => [index("comments_video_idx").on(t.videoId, t.createdAt)]);

export const commentReports = pgTable("comment_reports", {
  id: bigserial({ mode: "number" }).primaryKey(),
  commentId: uuid().notNull().references(() => comments.id, { onDelete: "cascade" }),
  reason: text().notNull(),
  reporterKey: text().notNull(),
  createdAt: now(),
}, (t) => [uniqueIndex("comment_reports_once").on(t.commentId, t.reporterKey)]);

/* ---------- 通報 ---------- */
export const REPORT_REASONS = ["minor_suspected", "non_consensual", "unauthorized_repost", "inappropriate", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

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
  url: text().notNull(),
  domain: text().notNull(),
  status: text().$type<"active" | "pending_domain_review" | "rejected" | "disabled_domain_removed" | "disabled_by_admin" | "disabled_healthcheck">().notNull(),
  lastCheckedAt: ts(),
  lastCheckStatus: text(),
  checkFailures: integer().notNull().default(0),
  createdAt: now(),
}, (t) => [uniqueIndex("outbound_links_video_uq").on(t.videoId)]);

export const linkClicks = pgTable("link_clicks", {
  id: bigserial({ mode: "number" }).primaryKey(),
  linkId: text().notNull(),
  videoId: uuid().notNull(),
  viewerKey: text().notNull(),
  isValid: boolean().notNull(),
  invalidReason: text(),
  createdAt: now(),
}, (t) => [index("link_clicks_idx").on(t.linkId, t.viewerKey, t.createdAt)]);

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
