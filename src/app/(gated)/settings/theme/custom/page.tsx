import { getThemePref } from "@/lib/theme-server";
import { NavBar } from "@/components/NavBar";
import { CustomTheme } from "@/components/theme/CustomTheme";

export const metadata = { title: "テーマをカスタマイズ" };

export default async function CustomPage() {
  return (
    <div className="screen">
      <NavBar title="テーマをカスタマイズ" back="/settings/theme" />
      <CustomTheme current={await getThemePref()} />
    </div>
  );
}
