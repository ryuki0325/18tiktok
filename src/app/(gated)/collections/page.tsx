import Link from "next/link";
import { redirect } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { myCollections } from "@/lib/collections";
import { NavBar } from "@/components/NavBar";
import { Icon } from "@/components/Icon";
import { NewCollection } from "./NewCollection";

export const metadata = { title: "コレクション" };

/** 保存のフォルダ分け。ログイン中だけ使える */
export default async function Collections() {
  const ctx = await viewerContext();
  if (!ctx.user) redirect("/login?next=/collections");
  const cols = await myCollections(ctx.user.id);
  return (
    <div className="screen">
      <NavBar title="コレクション" back="/me" />
      <div className="sec" style={{ gap: 16, paddingBottom: 24 }}>
        <Link className="row card" href="/me?tab=saved" style={{ padding: 14, alignItems: "center" }}>
          <span className="muted"><Icon name="bookmark" size={22} /></span>
          <span className="grow"><b>すべての保存</b><br /><span className="cap">コレクションに分けていない分も含め、保存した動画すべて</span></span>
          <span className="muted"><Icon name="chev" size={20} /></span>
        </Link>
        <div>
          <span className="label">コレクション<small>{cols.length}個</small></span>
          <div className="list" style={{ marginTop: 8 }}>
            {cols.length === 0 && <div className="row"><span className="cap">まだコレクションがありません。下から作成できます。</span></div>}
            {cols.map((c) => (
              <Link key={c.id} className="row" href={`/collections/${c.id}`}>
                <span className="muted"><Icon name="bookmark" size={20} filled /></span>
                <span className="grow"><b>{c.name}</b><br /><span className="cap num">{c.count}件</span></span>
                <span className="muted"><Icon name="chev" size={18} /></span>
              </Link>
            ))}
          </div>
        </div>
        <NewCollection />
      </div>
    </div>
  );
}
