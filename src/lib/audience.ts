/** 最初の分岐（見たい動画のジャンル）。投稿者は投稿時に1つ選ぶ */
export const AUDIENCES = [
  { id: "women", label: "女性", desc: "女性クリエイターの動画", hue: [330, 300, 350] },
  { id: "men", label: "男性", desc: "男性クリエイターの動画", hue: [215, 240, 195] },
  { id: "couple", label: "カップル", desc: "ふたりで出演する動画", hue: [350, 15, 285] },
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
