import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { setPublicLikesAction } from "@/lib/account-actions";
import { NavBar } from "@/components/NavBar";

export const metadata = { title: "プライバシー設定" };

export default async function PrivacySettings() {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent("/settings/privacy")}`);
  const [p] = await (await db()).select({ publicLikes: userPreferences.publicLikes }).from(userPreferences).where(eq(userPreferences.userId, u.id));
  const on = p?.publicLikes ?? false;
  return (
    <div className="screen">
      <NavBar title="プライバシー設定" back="/settings" />
      <div className="sec" style={{ gap: 16, paddingBottom: 24 }}>
        <div className="list">
          <form action={setPublicLikesAction} className="row" style={{ alignItems: "center" }}>
            {/* オフ→オンもオン→オフも、hidden で現在値を反転して送る */}
            <span className="grow">
              <b style={{ display: "block" }}>いいねした動画を公開</b>
              <span className="cap">オンにすると、あなたのプロフィールに「いいね」タブが表示され、他の人も見られます。オフなら自分だけ。</span>
            </span>
            <input type="hidden" name="public_likes" value={on ? "" : "on"} />
            <button type="submit" className={`sw${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label="いいねした動画を公開">
              <i />
            </button>
          </form>
        </div>
        <p className="cap" style={{ margin: 0 }}>※ 「保存した動画」「非公開の動画」「視聴履歴」は、設定に関わらず他の人には見えません。</p>
      </div>
    </div>
  );
}
