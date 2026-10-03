import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { outboundLinks, videos } from "@/db/schema";
import { viewerContext } from "@/lib/viewer";
import { Icon } from "@/components/Icon";
import { GoButton } from "./GoButton";

export const metadata = { title: "外部サイトへ移動します" };

export default async function Out({ params }: { params: Promise<{ id: string }> }) {
  await viewerContext();
  const { id } = await params;
  const [l] = await (await db()).select({ l: outboundLinks, title: videos.title }).from(outboundLinks)
    .innerJoin(videos, eq(videos.id, outboundLinks.videoId))
    .where(and(eq(outboundLinks.id, id), eq(outboundLinks.status, "active"), eq(videos.status, "published")));
  if (!l) notFound();
  return (
    <div className="center-screen">
      <div className="ring"><Icon name="ext" size={36} /></div>
      <h1 style={{ fontSize: 22, margin: "28px 0 18px" }}>外部サイトへ移動します</h1>
      <span className="cap">移動先のドメイン</span>
      <div className="domain">{l.l.domain}</div>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.7, margin: "0 0 8px" }}>ここから先は外部サイトです。<br />サービス内容や利用規約は、外部サイトでご確認ください。</p>
      <p className="cap" style={{ margin: "0 0 30px" }}><span className="badge b-info" style={{ marginRight: 6 }}>PR</span>このリンクには広告が含まれます</p>
      <GoButton id={id} />
    </div>
  );
}
