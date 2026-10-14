/**
 * 貼られた入力（ページURL、または <iframe> 埋め込みコード）を、iframe の src に出せる
 * 「埋め込み用URL」に正規化する。サーバー・クライアントの両方で使える純粋関数。
 *
 * - <iframe ... src="..."> の形なら、その src を取り出す（どのサイトでも『共有→埋め込み』の
 *   コードを貼れば表示できる）。
 * - YouTube / Vimeo / Dailymotion は、普通の視聴URLを埋め込み用URLに変換する。
 * - すでに埋め込み用URL（/embed/ や player. など）はそのまま使う。
 * - それ以外はそのまま返す（表示できるかは貼り先サイトの設定しだい）。
 *
 * 返り値が null＝URLとして解釈できない（入力ミス）。
 */
export function normalizeEmbed(raw: string): string | null {
  let s = (raw || "").trim();
  if (!s) return null;
  // <iframe ... src="..."> の埋め込みコードなら src を取り出す
  const iframe = s.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
  if (iframe) s = iframe[1].trim();
  // 先頭が // のプロトコル相対URLは https を補う
  if (s.startsWith("//")) s = `https:${s}`;

  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const path = u.pathname;

  // すでに埋め込み用のURLならそのまま使う
  if (/(^|\.)player\./i.test(u.hostname) || /\/embed(\/|frame|$)/i.test(path) || /\/embedframe\//i.test(path)) {
    return u.toString();
  }

  // YouTube
  if (host === "youtu.be") {
    const id = path.split("/").filter(Boolean)[0];
    if (id) return `https://www.youtube.com/embed/${id}`;
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const v = u.searchParams.get("v");
    if (v) return `https://www.youtube.com/embed/${v}`;
    const shorts = path.match(/\/shorts\/([^/]+)/);
    if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
    const live = path.match(/\/live\/([^/]+)/);
    if (live) return `https://www.youtube.com/embed/${live[1]}`;
  }

  // Vimeo
  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
    const id = path.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
  }

  // Dailymotion
  if (host === "dai.ly") {
    const id = path.split("/").filter(Boolean)[0];
    if (id) return `https://www.dailymotion.com/embed/video/${id}`;
  }
  if (host === "dailymotion.com" || host.endsWith(".dailymotion.com")) {
    const dm = path.match(/\/video\/([^/_]+)/);
    if (dm) return `https://www.dailymotion.com/embed/video/${dm[1]}`;
  }

  // それ以外はそのまま（埋め込みできるかは貼り先サイトの設定しだい）
  return u.toString();
}
