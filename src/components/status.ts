import type { HiddenReason, VideoStatus } from "@/db/schema";

/** 動画の状態の見せ方（投稿者・運営の両方で使う） */
export const VIDEO_STATUS_LABEL: Record<VideoStatus, [string, string]> = {
  draft: ["下書き", "b-info"],
  uploading: ["送信中", "b-info"],
  processing: ["変換中", "b-info"],
  pending_review: ["審査中", "b-warn"],
  approved: ["公開準備中", "b-ok"],
  published: ["公開中", "b-ok"],
  hidden: ["非公開", "b-info"],
  rejected: ["差し戻し", "b-bad"],
  deleted: ["削除", "b-info"],
};

/** 非公開の理由まで含めた表示 */
export function statusLabel(status: VideoStatus, hiddenReason?: HiddenReason | null): [string, string] {
  if (status !== "hidden") return VIDEO_STATUS_LABEL[status];
  if (hiddenReason === "by_report") return ["非公開（通報）", "b-bad"];
  if (hiddenReason === "by_admin") return ["非公開（運営）", "b-bad"];
  if (hiddenReason === "by_system") return ["非公開（自動）", "b-warn"];
  return ["非公開", "b-info"];
}
