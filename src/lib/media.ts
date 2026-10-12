import "server-only";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";

/**
 * 写真投稿の画像の保存と配信。
 * 動画は自社に保存せず、公式サンプル等の「埋め込み」で表示するため、動画ファイルの
 * アップロード・変換・配信はこのプロジェクトでは扱わない。
 * 写真は、本番では Bunny Storage に置く（Render のディスクは揮発性のため）。未設定の間は
 * このサーバー（.data/media/photos）に保存する。
 */

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** ローカル保存の基準ディレクトリ（開発・Bunny未設定時） */
export const mediaDir = () => path.resolve(process.env.MEDIA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "media"));
const imageDir = () => path.join(mediaDir(), "photos");

/** 1投稿に入れられる画像の枚数の上限（荒らし対策。既定30枚） */
export const maxImages = () => Number(process.env.UPLOAD_MAX_IMAGES || 30);
/** 1枚あたりの上限バイト数（端末で縮めた後のJPEGを想定。既定6MB） */
const MAX_IMAGE_BYTES = Number(process.env.UPLOAD_MAX_IMAGE_MB || 6) * 1024 * 1024;

/**
 * 写真の保存先に Bunny Storage を使う設定。4つそろっていれば有効。
 * - zone: Storage Zone 名  / key: その AccessKey（パスワード）
 * - host: 保存エンドポイント（地域により sg.storage.bunnycdn.com 等。既定は storage.bunnycdn.com）
 * - cdn: 配信に使う Pull Zone のホスト（xxxx.b-cdn.net）
 */
const bunnyStorageEnv = () => {
  const zone = process.env.BUNNY_STORAGE_ZONE, key = process.env.BUNNY_STORAGE_API_KEY, cdn = process.env.BUNNY_STORAGE_CDN_HOST;
  if (!zone || !key || !cdn) return null;
  const host = (process.env.BUNNY_STORAGE_HOST || "storage.bunnycdn.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return { zone, key, host, cdn: cdn.replace(/^https?:\/\//, "").replace(/\/$/, "") };
};
/** 写真を Bunny Storage に置くかどうか */
export const photosOnBunny = () => !!bunnyStorageEnv();

/**
 * その画像URLが「自分が保存した写真」の形かどうか。
 * ローカル保存（/media/photos/...）と Bunny Storage（設定した配信ホスト）の両方を受け付ける。
 */
export function isOwnImageUrl(userId: string, url: string): boolean {
  if (typeof url !== "string") return false;
  if (new RegExp(`^/media/photos/${userId}/[0-9a-f-]+\\.jpg$`).test(url)) return true;
  const b = bunnyStorageEnv();
  if (b) {
    const host = b.cdn.replace(/[.]/g, "\\.");
    if (new RegExp(`^https://${host}/photos/${userId}/[0-9a-f-]+\\.jpg$`).test(url)) return true;
  }
  return false;
}

/** data URL（端末で縮めたJPEG）を1枚保存し、配信URLを返す */
export async function saveImage(userId: string, dataUrl: string, w: number, h: number): Promise<{ url: string; w: number; h: number } | { error: string }> {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return { error: "画像の形式が正しくありません（JPEGのみ）" };
  const buf = Buffer.from(m[1], "base64");
  if (buf.byteLength > MAX_IMAGE_BYTES) return { error: "画像が大きすぎます" };
  // 先頭のしるしで本当にJPEGかを確かめる（拡張子やMIMEの自己申告は信用しない）
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return { error: "画像が正しくありません" };
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 8000 || h > 8000) return { error: "画像の大きさが正しくありません" };
  const id = crypto.randomUUID();
  const objectPath = `photos/${userId}/${id}.jpg`;
  const b = bunnyStorageEnv();
  if (b) {
    try {
      const res = await fetch(`https://${b.host}/${b.zone}/${objectPath}`, {
        method: "PUT",
        headers: { AccessKey: b.key, "Content-Type": "image/jpeg" },
        body: new Uint8Array(buf),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return { error: "画像の保存に失敗しました。しばらくしてからお試しください" };
    } catch { return { error: "画像の保存に失敗しました。通信環境をご確認ください" }; }
    // 配信は推測できないUUIDのパスで、CDN から直接
    return { url: `https://${b.cdn}/${objectPath}`, w, h };
  }
  const dir = path.join(imageDir(), userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${id}.jpg`), buf);
  return { url: `/media/photos/${userId}/${id}.jpg`, w, h };
}

/** 写真投稿の画像ファイルを消す（投稿が消えたときの後片付け） */
export async function deleteImages(images: { url: string }[] | null) {
  if (!images?.length) return;
  const b = bunnyStorageEnv();
  for (const im of images) {
    const m = /\/photos\/([0-9a-f-]+)\/([0-9a-f-]+\.jpg)$/.exec(im.url);
    if (!m) continue;
    const objectPath = `photos/${m[1]}/${m[2]}`;
    // 絶対URL（http〜）は Bunny 保存、相対URL（/media〜）はこのサーバー保存
    if (/^https?:\/\//.test(im.url)) {
      if (!b) continue;
      await fetch(`https://${b.host}/${b.zone}/${objectPath}`, {
        method: "DELETE", headers: { AccessKey: b.key }, signal: AbortSignal.timeout(15_000),
      }).catch(() => {});
    } else {
      await rm(path.join(imageDir(), m[1], m[2]), { force: true }).catch(() => {});
    }
  }
}
