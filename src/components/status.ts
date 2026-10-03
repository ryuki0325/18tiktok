export const VIDEO_STATUS_LABEL: Record<string, [string, string]> = {
  pending_review: ["審査中", "b-warn"], published: ["公開中", "b-ok"], rejected: ["差し戻し", "b-bad"],
  hidden_by_report: ["非公開（通報）", "b-bad"], hidden_by_creator: ["非公開", "b-info"], removed: ["削除", "b-info"],
};
