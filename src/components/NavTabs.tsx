import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/profile";
import { TabBar } from "./TabBar";

/** 下のバー（未読のお知らせの数つき） */
export async function NavTabs({ onVideo = false }: { onVideo?: boolean }) {
  const u = await currentUser();
  return <TabBar onVideo={onVideo} unread={await unreadCount(u?.id ?? null)} />;
}
