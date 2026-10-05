import type { Priority, ReportReason, ReportTarget } from "@/db/schema";

/**
 * 通報の理由ごとの扱い。画面・API・管理画面でこの1か所を見る。
 *
 * immediate が true の理由は、受け付けた時点で対象を自動的に非公開にする。
 * 被害が重く、調べている間に広まると取り返しがつかないものだけを対象にしている。
 * 「運営が確認するまで見えない」だけなので、誤りだった場合は運営が戻せる。
 */
export type ReasonSpec = {
  label: string;
  /** 利用者に見せる補足 */
  hint?: string;
  priority: Priority;
  /** 受け付けた時点で即、非公開にする */
  immediate: boolean;
  /** 何件集まったら自動で非公開にするか（immediate でないものだけ） */
  threshold?: number;
  /** 対応の期限（時間） */
  slaHours: number;
  /** この理由を選べる対象 */
  targets: readonly ReportTarget[];
};

const ALL = ["video", "profile", "comment"] as const;

export const REASON_SPEC: Record<ReportReason, ReasonSpec> = {
  minor_suspected: {
    label: "未成年の疑い",
    hint: "出演者が18歳未満に見える",
    priority: "critical", immediate: true, slaHours: 2, targets: ALL,
  },
  no_consent: {
    label: "本人の同意がない",
    hint: "写っている人が公開に同意していない",
    priority: "critical", immediate: true, slaHours: 6, targets: ALL,
  },
  voyeurism: {
    label: "盗撮の疑い",
    hint: "本人が知らないうちに撮影されている",
    priority: "critical", immediate: true, slaHours: 6, targets: ["video", "profile"],
  },
  revenge_porn: {
    label: "リベンジポルノ等の疑い",
    hint: "嫌がらせの目的で性的な画像が公開されている",
    priority: "critical", immediate: true, slaHours: 6, targets: ALL,
  },
  illegal: {
    label: "違法コンテンツ",
    hint: "法律に触れる内容が含まれている",
    priority: "critical", immediate: true, slaHours: 12, targets: ALL,
  },
  unauthorized_repost: {
    label: "無断掲載",
    hint: "他人の動画が許可なく上げられている",
    priority: "high", immediate: false, threshold: 2, slaHours: 24, targets: ["video", "profile"],
  },
  copyright: {
    label: "著作権侵害",
    hint: "音楽・映像などの権利を侵している",
    priority: "high", immediate: false, threshold: 2, slaHours: 24, targets: ["video", "profile"],
  },
  harassment: {
    label: "嫌がらせ",
    hint: "特定の人を攻撃している",
    priority: "medium", immediate: false, threshold: 3, slaHours: 72, targets: ALL,
  },
  spam: {
    label: "スパム",
    hint: "宣伝・勧誘・同じ内容の繰り返し",
    priority: "low", immediate: false, threshold: 5, slaHours: 168, targets: ALL,
  },
  other: {
    label: "その他",
    hint: "上に当てはまらない問題",
    priority: "low", immediate: false, threshold: 5, slaHours: 168, targets: ALL,
  },
};

export const REPORT_REASON_ORDER = Object.keys(REASON_SPEC) as ReportReason[];
export const reasonsFor = (t: ReportTarget) => REPORT_REASON_ORDER.filter((r) => REASON_SPEC[r].targets.includes(t));
export const reasonLabel = (r: string) => REASON_SPEC[r as ReportReason]?.label ?? r;

export const PRIORITY_LABEL: Record<Priority, string> = { critical: "緊急", high: "高", medium: "中", low: "低" };
export const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"];
/** 並び替え用の重み（小さいほど先に出す） */
export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const TARGET_LABEL: Record<ReportTarget, string> = { video: "動画", profile: "プロフィール", comment: "コメント" };
