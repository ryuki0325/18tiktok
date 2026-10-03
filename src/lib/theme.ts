/**
 * テーマエンジン（サーバー・クライアント共通）
 * Theme → Color Tokens → Components → All Screens（docs/07）
 */
export const THEME_IDS = ["midnight", "rose", "ocean", "emerald", "gold", "crimson", "minimal", "custom"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ColorMode = "dark" | "light" | "system";
export type CustomColors = { accent2: string; accent: string; bg: string; surface: string; text: string };
export type ThemePref = { id: ThemeId; mode: ColorMode; custom: CustomColors };
export type Tokens = {
  bg: string; surface: string; surface2: string; text: string; muted: string;
  accent: string; accent2: string; fill: string; fill2: string; on: string;
};

type Preset = { name: string; dark: Tokens; lightAccent: string; lightAccent2: string };

export const PRESETS: Record<Exclude<ThemeId, "custom">, Preset> = {
  midnight: { name: "Midnight", dark: { bg: "#090A0F", surface: "#151722", surface2: "#1D1F2B", text: "#FFFFFF", muted: "#A8ABB8", accent: "#C85CFF", accent2: "#8E5CFF", fill: "#A13BEB", fill2: "#7B4BF0", on: "#FFFFFF" }, lightAccent: "#8E2FD6", lightAccent2: "#6A3BD8" },
  rose: { name: "Rose", dark: { bg: "#0B0809", surface: "#1A1215", surface2: "#24181D", text: "#FFFFFF", muted: "#B8A8AE", accent: "#FF6FA8", accent2: "#E2477F", fill: "#FF6FA8", fill2: "#E2477F", on: "#1A0A10" }, lightAccent: "#C42D6B", lightAccent2: "#A3234F" },
  ocean: { name: "Ocean", dark: { bg: "#070A10", surface: "#111824", surface2: "#182131", text: "#FFFFFF", muted: "#A3AEC0", accent: "#4DA3FF", accent2: "#2E6BFF", fill: "#4DA3FF", fill2: "#2E6BFF", on: "#06101F" }, lightAccent: "#1E5FD1", lightAccent2: "#1746A8" },
  emerald: { name: "Emerald", dark: { bg: "#070B09", surface: "#111A15", surface2: "#18241D", text: "#FFFFFF", muted: "#A3B8AC", accent: "#3FD39A", accent2: "#14A37A", fill: "#3FD39A", fill2: "#14A37A", on: "#04140D" }, lightAccent: "#0D7D58", lightAccent2: "#0A6346" },
  gold: { name: "Gold", dark: { bg: "#0A0907", surface: "#17140F", surface2: "#211C15", text: "#FFF8EC", muted: "#B8AE9C", accent: "#D9B26A", accent2: "#A8833F", fill: "#D9B26A", fill2: "#A8833F", on: "#1A1206" }, lightAccent: "#8A6420", lightAccent2: "#6E4F18" },
  crimson: { name: "Crimson", dark: { bg: "#0B0707", surface: "#1A1112", surface2: "#251719", text: "#FFFFFF", muted: "#BCA6A8", accent: "#E5484D", accent2: "#A8262C", fill: "#C9363B", fill2: "#A8262C", on: "#FFFFFF" }, lightAccent: "#B42328", lightAccent2: "#8E1B20" },
  minimal: { name: "Minimal", dark: { bg: "#0E0E10", surface: "#18181B", surface2: "#222226", text: "#FFFFFF", muted: "#A1A1AA", accent: "#FFFFFF", accent2: "#D4D4D8", fill: "#FFFFFF", fill2: "#E4E4E7", on: "#111114" }, lightAccent: "#111114", lightAccent2: "#3A3B42" },
};

const LIGHT_BASE = { bg: "#FFFFFF", surface: "#F5F5F7", surface2: "#ECECF0", text: "#111114", muted: "#5E606B" };
export const CUSTOM_DEFAULT: CustomColors = { accent2: "#5B6CFF", accent: "#9C7BFF", bg: "#0C0B14", surface: "#18162A", text: "#F4F2FF" };
export const DEFAULT_PREF: ThemePref = { id: "midnight", mode: "dark", custom: CUSTOM_DEFAULT };

export const themeName = (id: ThemeId) => (id === "custom" ? "Custom" : PRESETS[id].name);

/* ---------- 色の計算 ---------- */
export const isHex = (h: unknown): h is string => typeof h === "string" && /^#[0-9a-fA-F]{6}$/.test(h);
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (r: number[]) => "#" + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
export const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
export const luminance = (h: string) =>
  rgb(h).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const onColor = (c: string) => (contrast("#FFFFFF", c) >= contrast("#111114", c) ? "#FFFFFF" : "#111114");

function mutedFor(text: string, bg: string, surface: string) {
  for (let t = 0.2; t <= 0.9; t += 0.02) {
    if (contrast(mix(text, bg, t), surface) < 4.6) return mix(text, bg, Math.max(0, t - 0.02));
  }
  return mix(text, bg, 0.4);
}

export function customTokens(c: CustomColors): Tokens {
  return {
    bg: c.bg, surface: c.surface, surface2: mix(c.surface, c.text, 0.06), text: c.text, muted: mutedFor(c.text, c.bg, c.surface),
    accent: c.accent, accent2: c.accent2, fill: c.accent, fill2: c.accent2, on: onColor(c.accent),
  };
}

/** mode は "dark" | "light" に解決済みのもの */
export function tokensFor(id: ThemeId, mode: "dark" | "light", custom: CustomColors = CUSTOM_DEFAULT): Tokens {
  if (id === "custom") return customTokens(custom);
  const p = PRESETS[id];
  if (mode === "light") return { ...LIGHT_BASE, accent: p.lightAccent, accent2: p.lightAccent2, fill: p.lightAccent, fill2: p.lightAccent2, on: "#FFFFFF" };
  return p.dark;
}

/** 動画の上（常に暗い）で使うアクセント。ライトテーマでも動画上で見える色にする */
export function videoTokens(id: ThemeId, custom: CustomColors = CUSTOM_DEFAULT): Pick<Tokens, "accent" | "accent2" | "fill" | "fill2" | "on"> {
  if (id !== "custom") { const d = PRESETS[id].dark; return { accent: d.accent, accent2: d.accent2, fill: d.fill, fill2: d.fill2, on: d.on }; }
  const t = customTokens(custom);
  if (contrast(t.accent, "#07070B") >= 3) return t;
  const a = mix(t.accent, "#FFFFFF", 0.45);
  return { accent: a, accent2: mix(t.accent2, "#FFFFFF", 0.3), fill: a, fill2: mix(t.accent2, "#FFFFFF", 0.3), on: onColor(a) };
}

export function cssVars(t: Partial<Tokens>, prefix = ""): Record<string, string> {
  const map: Record<keyof Tokens, string> = {
    bg: "--bg", surface: "--surface", surface2: "--surface-2", text: "--text", muted: "--muted",
    accent: "--accent", accent2: "--accent-2", fill: "--fill", fill2: "--fill-2", on: "--on",
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) if (v) out[prefix + map[k as keyof Tokens]] = v;
  return out;
}

export function cssText(vars: Record<string, string>) {
  return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";");
}

export function contrastWarnings(c: CustomColors): string[] {
  const w: string[] = [];
  const r = (n: number) => n.toFixed(1);
  if (contrast(c.text, c.bg) < 4.5) w.push(`文字と背景のコントラストが ${r(contrast(c.text, c.bg))} : 1 です（4.5以上を推奨）`);
  if (contrast(c.text, c.surface) < 4.5) w.push(`文字とカードのコントラストが ${r(contrast(c.text, c.surface))} : 1 です（4.5以上を推奨）`);
  if (contrast(c.accent, c.bg) < 3) w.push(`アクセントと背景のコントラストが ${r(contrast(c.accent, c.bg))} : 1 です（3以上を推奨）`);
  return w;
}

export function autoFix(c: CustomColors): CustomColors {
  const f = { ...c };
  f.text = contrast("#FFFFFF", f.bg) >= contrast("#111114", f.bg) ? "#FFFFFF" : "#111114";
  if (contrast(f.text, f.surface) < 4.5) f.surface = mix(f.bg, f.text, 0.06);
  for (let k = 0; k < 20 && contrast(f.accent, f.bg) < 3; k++) f.accent = mix(f.accent, luminance(f.bg) < 0.4 ? "#FFFFFF" : "#000000", 0.12);
  return f;
}

/* ---------- 保存形式（Cookie "theme" / user_preferences） ---------- */
export function parsePref(raw: unknown): ThemePref {
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!o || typeof o !== "object") return DEFAULT_PREF;
    const p = o as Partial<ThemePref>;
    const id = THEME_IDS.includes(p.id as ThemeId) ? (p.id as ThemeId) : DEFAULT_PREF.id;
    const mode = (["dark", "light", "system"] as const).includes(p.mode as ColorMode) ? (p.mode as ColorMode) : DEFAULT_PREF.mode;
    const c = (p.custom ?? {}) as Partial<CustomColors>;
    const custom = Object.fromEntries(
      (Object.keys(CUSTOM_DEFAULT) as (keyof CustomColors)[]).map((k) => [k, isHex(c[k]) ? c[k]!.toUpperCase() : CUSTOM_DEFAULT[k]]),
    ) as CustomColors;
    return { id, mode, custom };
  } catch {
    return DEFAULT_PREF;
  }
}
