import { getThemePref } from "@/lib/theme-server";
import { NavBar } from "@/components/NavBar";
import { ThemeSettings } from "@/components/theme/ThemeSettings";

export const metadata = { title: "デザイン・テーマ" };

export default async function ThemePage() {
  return (
    <div className="screen">
      <NavBar title="デザイン・テーマ" back="/settings" />
      <ThemeSettings current={await getThemePref()} />
    </div>
  );
}
