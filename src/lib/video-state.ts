import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import type { HiddenReason, VideoStatus } from "@/db/schema";

/**
 * 動画の状態の移り変わり。
 *
 *   draft → uploading → processing → pending_review → approved → published
 *                                          ↓              ↓          ↓
 *                                       rejected        hidden ←─────┘
 *
 * ここに書いていない移り方はできない。たとえば審査を飛ばして published にはできないし、
 * deleted からは戻せない。画面やAPIがどこから呼んでも、必ずこの表を通す。
 */
const ALLOWED: Record<VideoStatus, readonly VideoStatus[]> = {
  draft: ["uploading", "pending_review", "deleted"],
  uploading: ["processing", "draft", "rejected", "deleted"],
  processing: ["pending_review", "rejected", "deleted"],
  pending_review: ["approved", "rejected", "hidden", "deleted"],
  approved: ["published", "hidden", "rejected", "deleted"],
  published: ["hidden", "pending_review", "deleted"],
  hidden: ["published", "pending_review", "approved", "deleted"],
  rejected: ["pending_review", "deleted"],
  deleted: [],
};

/** 視聴者に見せてよい状態 */
export const VISIBLE: VideoStatus[] = ["published"];
/** 投稿者の「非公開」タブに出す状態 */
export const CREATOR_PRIVATE: VideoStatus[] = ["draft", "uploading", "processing", "pending_review", "approved", "hidden", "rejected"];
/** 運営の審査待ちキューに出す状態 */
export const NEEDS_REVIEW: VideoStatus[] = ["pending_review"];

export const canTransition = (from: VideoStatus, to: VideoStatus) => from === to || ALLOWED[from].includes(to);

export class InvalidTransition extends Error {
  constructor(from: VideoStatus, to: VideoStatus) {
    super(`動画の状態を ${from} から ${to} には変えられません`);
    this.name = "InvalidTransition";
  }
}

export type TransitionInput = {
  videoId: string;
  to: VideoStatus;
  /** 非公開にするときの理由（誰が下げたか） */
  hiddenReason?: HiddenReason;
  /** 投稿者に見せる理由の文 */
  statusReason?: string | null;
  /** 変えた人。運営なら管理者ID、投稿者本人なら自分のID、仕組みによる自動なら null */
  actorId?: string | null;
  /** 現在の状態がこれらのときだけ変える（同時に押されたときの取り違えを防ぐ） */
  expect?: VideoStatus[];
};

/**
 * 動画の状態をひとつ進める。許されない移り方なら InvalidTransition を投げる。
 * 戻り値は変更後の行。何も変わらなかった場合は null。
 */
export async function transition(conn: DB, input: TransitionInput) {
  const [v] = await conn.select().from(s.videos).where(eq(s.videos.id, input.videoId));
  if (!v) return null;
  const from = v.status;
  if (input.expect && !input.expect.includes(from)) return null;
  if (from === input.to) return v;
  if (!canTransition(from, input.to)) throw new InvalidTransition(from, input.to);

  const now = new Date();
  const set: Partial<typeof s.videos.$inferInsert> = {
    status: input.to,
    statusReason: input.statusReason === undefined ? v.statusReason : input.statusReason,
    hiddenReason: input.to === "hidden" ? (input.hiddenReason ?? "by_admin") : null,
  };
  if (input.to === "approved") set.approvedAt = now;
  if (input.to === "published" && !v.publishedAt) set.publishedAt = now;
  if (input.to === "deleted") set.deletedAt = now;

  // 現在の状態を条件に入れることで、同時に2人が操作しても片方しか通らないようにする
  const [row] = await conn.update(s.videos).set(set)
    .where(and(eq(s.videos.id, input.videoId), eq(s.videos.status, from))).returning();
  if (!row) return null;

  // 公開を外したら、その動画の外部リンクも止める／戻したら戻す
  if (input.to === "deleted") {
    await conn.update(s.outboundLinks).set({ status: "disabled_by_admin" }).where(eq(s.outboundLinks.videoId, row.id));
  }
  return row;
}

/** 審査を通して公開する（approved を経由するので、審査を飛ばせない） */
export async function approveAndPublish(conn: DB, videoId: string, actorId: string | null) {
  const a = await transition(conn, { videoId, to: "approved", statusReason: null, actorId, expect: ["pending_review", "hidden"] });
  if (!a) return null;
  return transition(conn, { videoId, to: "published", actorId });
}

/** 期限切れの措置を解く（下書きのまま放置された動画の後片付けにも使う） */
export async function expireHidden(conn: DB) {
  const rows = await conn.select({ id: s.videos.id }).from(s.videos)
    .where(and(eq(s.videos.status, "uploading"), inArray(s.videos.mediaStatus, ["failed"])));
  for (const r of rows) await transition(conn, { videoId: r.id, to: "rejected", statusReason: "動画の変換に失敗しました" }).catch(() => {});
  return rows.length;
}
