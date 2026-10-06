import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";
import { absoluteUrl, mailConfigured, sendMail } from "./mail";

/**
 * 利用者へのお知らせ。
 *
 * サイト内の「お知らせ」は必ず残し、メールは送れるときだけ追加で送る。
 * メールが送れなくても運用が止まらないように、失敗しても処理は続ける。
 *
 * 【メールの書き方】
 * 件名と本文には、動画の題名や措置の理由といった立ち入った内容を書かない。
 * メールは本人以外の目に触れることがあるため、詳しい内容はサイトを開いて見てもらう。
 */
export type Notice = {
  userId: string;
  /** サイト内のお知らせの種類（既存の kind をそのまま使う） */
  kind: string;
  /** サイト内のお知らせに出す文（詳しくてよい） */
  body: string;
  /** メールの件名。省略するとメールを送らない */
  mailSubject?: string;
  /** メールの本文の1行目（立ち入った内容は書かない） */
  mailLead?: string;
  /** メールから開いてもらうページ */
  path?: string;
};

export async function notifyUser(conn: DB, n: Notice) {
  await conn.insert(s.notifications).values({ userId: n.userId, kind: n.kind, body: n.body });
  if (!n.mailSubject || !mailConfigured()) return { mailed: false };

  const [u] = await conn.select({ email: s.users.email, verified: s.users.emailVerifiedAt, status: s.users.status })
    .from(s.users).where(eq(s.users.id, n.userId));
  // 確認が済んでいないメールアドレスには送らない（他人のアドレスを登録された場合に届いてしまうため）
  if (!u?.email || !u.verified) return { mailed: false };

  const url = await absoluteUrl(n.path ?? "/notifications");
  const text = [
    n.mailLead ?? "お知らせがあります。",
    "",
    `くわしくはこちらをご覧ください：\n${url}`,
    "",
    "このメールに心当たりがない場合は、破棄してください。",
  ].join("\n");
  try {
    const r = await sendMail({ to: u.email, subject: n.mailSubject, text });
    return { mailed: r.delivered };
  } catch (e) {
    // メールが送れなくても、サイト内のお知らせは残っているので運用は続けられる
    console.error("[glow] お知らせメールを送れませんでした", e);
    return { mailed: false };
  }
}
