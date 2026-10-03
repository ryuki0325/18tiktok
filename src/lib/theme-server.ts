import "server-only";
import { cookies } from "next/headers";
import { cssText, cssVars, parsePref, tokensFor, videoTokens, type ThemePref } from "./theme";

export const THEME_COOKIE = "theme";

export async function getThemePref(): Promise<ThemePref> {
  return parsePref((await cookies()).get(THEME_COOKIE)?.value ?? null);
}

/** <head> に入れるテーマCSS。system の場合は prefers-color-scheme で切り替える */
export function themeCss(p: ThemePref): string {
  const block = (mode: "dark" | "light") => {
    const t = tokensFor(p.id, mode, p.custom);
    const dark = p.id === "custom" ? parseInt(t.bg.slice(1, 3), 16) < 128 : mode === "dark";
    return `${cssText(cssVars(t))};color-scheme:${dark ? "dark" : "light"}`;
  };
  const vt = `.vt{${cssText(cssVars(videoTokens(p.id, p.custom)))}}`;
  if (p.mode === "system" && p.id !== "custom") {
    return `:root{${block("dark")}}@media (prefers-color-scheme: light){:root{${block("light")}}}${vt}`;
  }
  return `:root{${block(p.mode === "light" ? "light" : "dark")}}${vt}`;
}
