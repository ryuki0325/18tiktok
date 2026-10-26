import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { promos } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { maxUploadBytes, maxUploadSec } from "@/lib/media";
import { PromoForm } from "../PromoForm";

export const metadata = { title: "枠を編集" };

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export default async function EditPromo({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(["super_admin"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const conn = await db();
  const [p] = await conn.select().from(promos).where(eq(promos.id, id));
  if (!p) notFound();
  return (
    <>
      <h1>枠を編集</h1>
      <p className="cap"><Link href="/admin/promos" style={{ color: "var(--accent)" }}>← 広告・アフィリ枠の一覧へ</Link></p>
      <PromoForm maxMb={Math.round(maxUploadBytes() / 1024 / 1024)} maxSec={maxUploadSec()} editing={{
        id: p.id, kind: p.kind, title: p.title, body: p.body, imageUrl: p.imageUrl, embedUrl: p.embedUrl, videoUrl: p.videoUrl,
        ctaText: p.ctaText, targetUrl: p.targetUrl, html: p.html, label: p.label, category: p.category, weight: p.weight,
      }} />
    </>
  );
}
