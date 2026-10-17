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

  // フィードで“動画のように自動再生”させる埋め込み用URLを作る（ミュート＋ループ＋インライン）
  const yt = (id: string) => `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${id}&rel=0&modestbranding=1`;

  // YouTube
  if (host === "youtu.be") {
    const id = path.split("/").filter(Boolean)[0];
    if (id) return yt(id);
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const v = u.searchParams.get("v");
    if (v) return yt(v);
    const shorts = path.match(/\/shorts\/([^/]+)/);
    if (shorts) return yt(shorts[1]);
    const live = path.match(/\/live\/([^/]+)/);
    if (live) return yt(live[1]);
  }

  // Vimeo
  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
    const id = path.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&loop=1&playsinline=1`;
  }

  // Dailymotion
  if (host === "dai.ly") {
    const id = path.split("/").filter(Boolean)[0];
    if (id) return `https://www.dailymotion.com/embed/video/${id}?autoplay=1&mute=1`;
  }
  if (host === "dailymotion.com" || host.endsWith(".dailymotion.com")) {
    const dm = path.match(/\/video\/([^/_]+)/);
    if (dm) return `https://www.dailymotion.com/embed/video/${dm[1]}?autoplay=1&mute=1`;
  }

  // X / Twitter の投稿 → 公式の埋め込み iframe（ツイート本文＋動画が表示される）
  if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com" || host.endsWith(".twitter.com")) {
    const tw = path.match(/\/status(?:es)?\/(\d+)/);
    if (tw) return `https://platform.twitter.com/embed/Tweet.html?id=${tw[1]}`;
  }

  // Instagram の投稿・リール → 公式の埋め込み
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const ig = path.match(/\/(p|reel|reels|tv)\/([^/]+)/);
    if (ig) { const kind = ig[1] === "reels" ? "reel" : ig[1]; return `https://www.instagram.com/${kind}/${ig[2]}/embed`; }
  }

  // TikTok の動画 → 公式の埋め込み（短縮URL vm.tiktok.com は数字IDが取れないため対象外）
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const tk = path.match(/\/video\/(\d+)/);
    if (tk) return `https://www.tiktok.com/embed/v2/${tk[1]}`;
  }

  // それ以外はそのまま（埋め込みできるかは貼り先サイトの設定しだい）
  return u.toString();
}
