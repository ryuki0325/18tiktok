import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { currentUser } from "./auth";
import { fail } from "./http";
import { isUuid } from "./media";

/** 自分のアップロードだけ触れる（承認済みの投稿者のみ） */
export async function ownUpload(id: string) {
  const u = await currentUser();
  if (!u) return { error: fail("UNAUTHORIZED", "ログインが必要です", 401) } as const;
  if (u.creatorStatus !== "approved") return { error: fail("FORBIDDEN", "投稿者として承認されていません", 403) } as const;
  if (!isUuid(id)) return { error: fail("NOT_FOUND", "見つかりません", 404) } as const;
  const conn = await db();
  const [row] = await conn.select().from(uploads).where(eq(uploads.id, id));
  if (!row || row.userId !== u.id) return { error: fail("NOT_FOUND", "見つかりません", 404) } as const;
  return { conn, user: u, upload: row } as const;
}
