/** 最初の分岐（見たい動画のジャンル）。投稿者は投稿時に1つ選ぶ */
export const AUDIENCES = [
  { id: "women", label: "女性", desc: "女性クリエイターの動画", hue: [330, 300, 350] },
  { id: "men", label: "男性", desc: "男性クリエイターの動画", hue: [215, 240, 195] },
  { id: "gay", label: "ゲイ", desc: "男性同士の動画", hue: [205, 230, 185] },
  { id: "lesbian", label: "レズ", desc: "女性同士の動画", hue: [320, 290, 340] },
  { id: "all", label: "すべて", desc: "ジャンルを決めずに見る", hue: [270, 250, 300] },
] as const;

export type Audience = (typeof AUDIENCES)[number]["id"];
export type VideoCategory = Exclude<Audience, "all">;
export const VIDEO_CATEGORIES = AUDIENCES.filter((a) => a.id !== "all") as readonly { id: VideoCategory; label: string; desc: string; hue: readonly number[] }[];
export const isAudience = (v: unknown): v is Audience => AUDIENCES.some((a) => a.id === v);
export const audienceLabel = (v: string) => AUDIENCES.find((a) => a.id === v)?.label ?? "すべて";

/** 好みのタグ（大人向け・露骨な表現と未成年を連想させる言葉は使わない） */
export const TAG_GROUPS: { title: string; tags: string[] }[] = [
  { title: "雰囲気", tags: ["セクシー", "大人の時間", "誘惑", "ムード", "夜のひととき", "癒し", "ASMR"] },
  { title: "シチュエーション", tags: ["ホテル", "バスタイム", "ベッドルーム", "ナイトプール", "ドライブ", "ラウンジ", "旅"] },
  { title: "スタイル", tags: ["ランジェリー", "ボディライン", "美脚", "フェチ", "ダンス", "カップル", "素人"] },
];

/* ================= はじめにの質問（答え → タグ・刺激の強さ） ================= */
export type QuizOption = { id: string; label: string; desc?: string; hue?: [number, number, number]; tags: string[] };

/** Q2 今夜の気分は？（1つ） */
export const MOODS: QuizOption[] = [
  { id: "sweet", label: "甘くとろける", desc: "恋人みたいな甘い時間", hue: [330, 350, 300], tags: ["ラブラブ", "イチャイチャ", "癒し"] },
  { id: "sensual", label: "大人の色気", desc: "余裕のある、しっとりした空気", hue: [280, 300, 250], tags: ["大人の色気", "セクシー", "ムード"] },
  { id: "wild", label: "刺激的に", desc: "ドキドキする展開がほしい", hue: [350, 10, 330], tags: ["誘惑", "刺激的", "フェチ"] },
  { id: "relax", label: "癒されたい", desc: "声や息づかいにひたりたい", hue: [200, 230, 260], tags: ["ASMR", "囁き", "癒し"] },
];

/** Q3 好きなシチュエーションは？（いくつでも） */
export const SITUATIONS: QuizOption[] = [
  "ホテル", "バスルーム", "ベッドルーム", "ソファ・リビング", "ナイトプール", "オフィス", "車内", "旅先・野外",
].map((t) => ({ id: t, label: t, tags: [t] }));

/** Q4 惹かれるのは？（いくつでも。見たいジャンルで選択肢が変わる。未成年を連想させる言葉は使わない） */
const ATTRACT: Record<VideoCategory, string[]> = {
  women: ["大人の色気", "スレンダー", "グラマー", "美脚", "ランジェリー", "年上の女性", "素人感"],
  men: ["筋肉質", "細マッチョ", "大人の色気", "スーツ", "年上の男性", "素人感"],
  gay: ["筋肉質", "細マッチョ", "大人の色気", "スーツ", "素人感"],
  lesbian: ["大人の色気", "スレンダー", "グラマー", "ランジェリー", "素人感"],
};
export function attractionOptions(a: Audience): QuizOption[] {
  const list = a === "all" ? [...new Set([...ATTRACT.women, ...ATTRACT.men, ...ATTRACT.gay, ...ATTRACT.lesbian])] : ATTRACT[a];
  return list.map((t) => ({ id: t, label: t, tags: [t] }));
}

/** Q5 刺激の強さは？（フィードの絞り込みに使う。これより強い動画は表示しない） */
export const INTENSITIES = [
  { level: 1, label: "ソフト", desc: "ほのかな色気・ちら見せまで" },
  { level: 2, label: "ミディアム", desc: "セクシーな雰囲気をしっかり" },
  { level: 3, label: "ハード", desc: "刺激的な表現も見たい（法令の範囲内）" },
] as const;
export type Intensity = 1 | 2 | 3;
export const isIntensity = (v: unknown): v is Intensity => v === 1 || v === 2 || v === 3;
export const intensityLabel = (v: number) => INTENSITIES.find((x) => x.level === v)?.label ?? "ソフト";

/** 投稿で選べる・DBに入れておくタグ（質問の選択肢すべて） */
export const ALL_QUIZ_TAGS = [...new Set([
  ...MOODS.flatMap((m) => m.tags), ...SITUATIONS.flatMap((s) => s.tags), ...Object.values(ATTRACT).flat(),
])];
