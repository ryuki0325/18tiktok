import { redirect } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { watchHistory } from "@/lib/history";
import { clearHistoryAction } from "@/lib/social-actions";
import { NavBar } from "@/components/NavBar";
import { ProfileGrid } from "@/components/profile/ProfileGrid";
import { Icon } from "@/components/Icon";

export const metadata = { title: "視聴履歴" };

/** 自分が見た動画を新しい順に。ログイン中だけ記録・表示する */
export default async function History() {
  const ctx = await viewerContext();
  if (!ctx.user) redirect("/login?next=/history");
  const cards = await watchHistory(ctx.user.id, ctx);
  return (
    <div className="screen">
      <NavBar title="視聴履歴" back="/me"
        right={cards.length ? (
          <form action={clearHistoryAction}>
            <button className="iconbtn" aria-label="履歴をすべて消す"><Icon name="trash" size={20} /></button>
          </form>
        ) : undefined} />
      <div className="sec" style={{ paddingBottom: 24 }}>
        {cards.length === 0 ? (
          <div className="prof-empty"><Icon name="gauge" size={38} /><b>視聴履歴はまだありません</b><span className="cap">見た動画がここに新しい順で並びます。記録されるのはログイン中だけです。</span></div>
        ) : (
          <>
            <p className="cap" style={{ margin: "0 0 10px" }}>最近見た {cards.length} 件。右上のゴミ箱ですべて消せます。</p>
            <ProfileGrid cards={cards} empty={null} />
          </>
        )}
      </div>
    </div>
  );
}
