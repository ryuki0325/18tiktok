import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { blocks, users } from "@/db/schema";
import { viewerKey } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";
import { Avatar } from "@/components/VideoBackdrop";
import { UnblockButton } from "./UnblockButton";

export const metadata = { title: "表示しない投稿者" };

export default async function Blocks() {
  const key = await viewerKey();
  const rows = await (await db()).select({ id: users.id, handle: users.handle, avatarHue: users.avatarHue }).from(blocks)
    .innerJoin(users, eq(users.id, blocks.creatorId)).where(eq(blocks.viewerKey, key)).orderBy(desc(blocks.createdAt));
  return (
    <div className="screen">
      <NavBar title="表示しない投稿者" back="/settings" />
      <div className="sec" style={{ gap: 12 }}>
        <p className="cap" style={{ margin: 0 }}>フィードの「…」→「この投稿者を表示しない」で追加されます。ここで戻すと、また表示されます。</p>
        {rows.length === 0 ? <p className="cap" style={{ textAlign: "center", padding: 40 }}>表示しない投稿者はいません。</p> : (
          <div className="list">
            {rows.map((r) => <div key={r.id} className="row"><Avatar hue={r.avatarHue} size={36} /><span className="grow">@{r.handle}</span><UnblockButton id={r.id} /></div>)}
          </div>
        )}
      </div>
    </div>
  );
}
