import "server-only";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import * as s from "@/db/schema";

/**
 * 動画ファイルの保存と配信。
 * - DBには動画の「場所」（再生URL・サムネイルURL）と縦横・長さだけを入れ、実ファイルは置かない
 * - 本番は Bunny Stream（オブジェクトストレージ＋HLS変換＋CDN）。スマホは CDN から直接 .m3u8 を取りに行く
 * - Bunny 未設定の間は、このサーバー（.data/media）に保存し、ffmpeg があれば HLS（複数画質）に変換する
 */
export type Provider = "local" | "bunny";
export type Upload = typeof s.uploads.$inferSelect;

/** 1チャンクの大きさ。スマホ回線で1回の送信が数秒で終わる程度 */
export const CHUNK_SIZE = Number(process.env.UPLOAD_CHUNK_KB || 8192) * 1024;
export const maxUploadBytes = () => Number(process.env.UPLOAD_MAX_MB || 2048) * 1024 * 1024;
export const UPLOAD_TTL_MS = 24 * 3600_000;

const bunnyEnv = () => {
  const lib = process.env.BUNNY_STREAM_LIBRARY_ID, key = process.env.BUNNY_STREAM_API_KEY, cdn = process.env.BUNNY_STREAM_CDN_HOST;
  return lib && key && cdn ? { lib, key, cdn: cdn.replace(/^https?:\/\//, "").replace(/\/$/, "") } : null;
};

/**
 * 使う保存先。MEDIA_PROVIDER で明示でき、未指定なら Bunny の設定があれば Bunny。
 * 本番で local を使うのは MEDIA_PROVIDER=local を明示した時だけ（Render などはディスクが再起動で消えるため）
 */
export function mediaProvider(): Provider | null {
  const p = process.env.MEDIA_PROVIDER;
  if (p === "none") return null;
  if (p === "bunny" || (!p && bunnyEnv())) return bunnyEnv() ? "bunny" : null;
  if (p === "local" || process.env.NODE_ENV !== "production") return "local";
  return null;
}

/** 設定の状態（管理者向けの表示用。鍵そのものは返さない） */
export function mediaStatus() {
  const b = bunnyEnv();
  return {
    provider: mediaProvider() ?? "なし（アップロードは準備中の表示）",
    bunny: {
      libraryId: process.env.BUNNY_STREAM_LIBRARY_ID ? "設定済み" : "未設定",
      apiKey: process.env.BUNNY_STREAM_API_KEY ? "設定済み" : "未設定",
      cdnHost: b ? b.cdn : process.env.BUNNY_STREAM_CDN_HOST ? "形式を確認してください" : "未設定",
    },
    maxMb: Math.round(maxUploadBytes() / 1024 / 1024),
    chunkMb: Math.round(CHUNK_SIZE / 1024 / 1024 * 10) / 10,
  };
}

/** Bunny Stream に実際につないで、鍵が正しいかを確かめる（管理画面から呼ぶ） */
export async function checkBunny(): Promise<{ ok: boolean; message: string }> {
  const b = bunnyEnv();
  if (!b) return { ok: false, message: "BUNNY_STREAM_LIBRARY_ID / API_KEY / CDN_HOST の3つを設定してください。" };
  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${b.lib}/videos?page=1&itemsPerPage=1`, {
      headers: { AccessKey: b.key, accept: "application/json" }, signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, message: "API Key が違うか、権限がありません（Stream → ライブラリ → API の API Key を確認してください）。" };
    if (res.status === 404) return { ok: false, message: "Video Library ID が違います。" };
    if (!res.ok) return { ok: false, message: `Bunny Stream が ${res.status} を返しました。少し待ってからもう一度お試しください。` };
    const j = (await res.json()) as { totalItems?: number };
    return { ok: true, message: `接続できました（ライブラリ内の動画：${j.totalItems ?? 0}本／配信元：${b.cdn}）。` };
  } catch (e) {
    return { ok: false, message: `つながりませんでした：${e instanceof Error ? e.message : String(e)}` };
  }
}

export const mediaDir = () => path.resolve(process.env.MEDIA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "media"));
const partPath = (id: string) => path.join(mediaDir(), "_parts", `${id}.part`);
/** ローカル保存の公開URL。前段にCDNを置く場合は MEDIA_CDN_URL を指定 */
const localUrl = (rel: string) => `${(process.env.MEDIA_CDN_URL || "").replace(/\/$/, "")}/media/${rel}`;

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/* ---------------- アップロードの開始 ---------------- */

export type TusTarget = { endpoint: string; headers: Record<string, string>; metadata: Record<string, string>; chunkSize: number };

export async function startUpload(conn: DB, userId: string, f: { filename: string; mime: string; size: number }): Promise<{ upload: Upload; tus: TusTarget }> {
  const provider = mediaProvider();
  if (!provider) throw new Error("NO_PROVIDER");
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS);
  const [u] = await conn.insert(s.uploads).values({ userId, provider, filename: f.filename.slice(0, 200), mime: f.mime, size: f.size, expiresAt }).returning();
  if (provider === "local") {
    await mkdir(path.dirname(partPath(u.id)), { recursive: true });
    await writeFile(partPath(u.id), "");
    return { upload: u, tus: { endpoint: `/api/v1/uploads/${u.id}/tus`, headers: {}, metadata: { filetype: f.mime }, chunkSize: CHUNK_SIZE } };
  }
  const b = bunnyEnv()!;
  const res = await fetch(`https://video.bunnycdn.com/library/${b.lib}/videos`, {
    method: "POST", headers: { AccessKey: b.key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ title: `glow-${u.id}` }),
  });
  if (!res.ok) throw new Error(`Bunny Stream に動画を作れませんでした（${res.status}）`);
  const { guid } = (await res.json()) as { guid: string };
  const [u2] = await conn.update(s.uploads).set({ providerRef: guid }).where(eq(s.uploads.id, u.id)).returning();
  // 署名付きの直接アップロード（APIキーはブラウザに渡さない）
  const expire = Math.floor(expiresAt.getTime() / 1000);
  const signature = createHash("sha256").update(b.lib + b.key + expire + guid).digest("hex");
  return {
    upload: u2,
    tus: {
      endpoint: "https://video.bunnycdn.com/tusupload",
      headers: { AuthorizationSignature: signature, AuthorizationExpire: String(expire), VideoId: guid, LibraryId: b.lib },
      metadata: { filetype: f.mime, title: `glow-${u.id}` }, chunkSize: CHUNK_SIZE,
    },
  };
}

/* ---------------- local：チャンクの受け取り（tus の PATCH） ---------------- */

export async function appendChunk(conn: DB, u: Upload, offset: number, body: Uint8Array): Promise<{ ok: true; received: number } | { ok: false; status: number; received: number }> {
  if (offset !== u.received) return { ok: false, status: 409, received: u.received };
  if (offset + body.byteLength > u.size) return { ok: false, status: 413, received: u.received };
  const { appendFile } = await import("node:fs/promises");
  await appendFile(partPath(u.id), body);
  // 実ファイルの大きさを正とする（途中で落ちた場合のずれを防ぐ）
  const real = (await stat(partPath(u.id))).size;
  await conn.update(s.uploads).set({ received: real, updatedAt: new Date() }).where(eq(s.uploads.id, u.id));
  return { ok: true, received: real };
}

/* ---------------- 完了 → 変換 ---------------- */

/** アップロード完了の合図。local は変換を裏で始め、Bunny は状態を確認する */
export async function completeUpload(conn: DB, u: Upload, meta: { width?: number; height?: number; durationMs?: number; poster?: Uint8Array | null }) {
  const base = { width: meta.width ?? null, height: meta.height ?? null, durationMs: meta.durationMs ?? null, updatedAt: new Date() };
  if (u.provider === "bunny") {
    await conn.update(s.uploads).set({ ...base, status: "processing" }).where(eq(s.uploads.id, u.id));
    return refreshUpload(conn, u.id);
  }
  if (u.received !== u.size) throw new Error("INCOMPLETE");
  const dir = path.join(mediaDir(), u.id);
  await mkdir(dir, { recursive: true });
  const src = path.join(dir, sourceName(u.mime));
  await rename(partPath(u.id), src);
  if (meta.poster?.byteLength) await writeFile(path.join(dir, "poster.jpg"), meta.poster);
  await conn.update(s.uploads).set({ ...base, status: "processing" }).where(eq(s.uploads.id, u.id));
  // 変換は時間がかかるので待たない（状態は GET /api/v1/uploads/:id で確認）
  void transcodeLocal(conn, u.id, sourceName(u.mime), !!meta.poster?.byteLength).catch(async (e) => {
    console.error("[glow] 動画の変換に失敗しました", e);
    await markUpload(conn, u.id, { status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 500) });
  });
  const [row] = await conn.select().from(s.uploads).where(eq(s.uploads.id, u.id));
  return row;
}

/** 外部サービスの状態を取り直す（Bunny の Webhook や画面からの問い合わせで呼ぶ） */
export async function refreshUpload(conn: DB, id: string): Promise<Upload> {
  const [u] = await conn.select().from(s.uploads).where(eq(s.uploads.id, id));
  if (!u || u.provider !== "bunny" || u.status === "ready" || u.status === "failed" || !u.providerRef) return u;
  const b = bunnyEnv();
  if (!b) return u;
  const res = await fetch(`https://video.bunnycdn.com/library/${b.lib}/videos/${u.providerRef}`, { headers: { AccessKey: b.key, accept: "application/json" } });
  if (!res.ok) return u;
  const v = (await res.json()) as { status: number; width: number; height: number; length: number };
  // Bunny の status：4=変換完了 / 5=エラー / 6=アップロード失敗。それ以外は処理中
  if (v.status === 4) {
    return markUpload(conn, id, {
      status: "ready", width: v.width || u.width, height: v.height || u.height, durationMs: v.length ? Math.round(v.length * 1000) : u.durationMs,
      playbackUrl: `https://${b.cdn}/${u.providerRef}/playlist.m3u8`, thumbnailUrl: `https://${b.cdn}/${u.providerRef}/thumbnail.jpg`,
    });
  }
  if (v.status === 5 || v.status === 6) return markUpload(conn, id, { status: "failed", error: `Bunny Stream status ${v.status}` });
  return u;
}

/** アップロードの状態を更新し、紐づいた動画にも反映する */
export async function markUpload(conn: DB, id: string, set: Partial<typeof s.uploads.$inferInsert>): Promise<Upload> {
  const [u] = await conn.update(s.uploads).set({ ...set, updatedAt: new Date() }).where(eq(s.uploads.id, id)).returning();
  if (u?.videoId) await applyUploadToVideo(conn, u);
  return u;
}

/** 動画の行に「場所」と軽い情報だけを写す */
export async function applyUploadToVideo(conn: DB, u: Upload) {
  if (!u.videoId) return;
  await conn.update(s.videos).set({
    mediaStatus: u.status === "ready" ? "ready" : u.status === "failed" ? "failed" : "processing",
    playbackUrl: u.playbackUrl, thumbnailUrl: u.thumbnailUrl, width: u.width, height: u.height, durationMs: u.durationMs,
  }).where(eq(s.videos.id, u.videoId));
}

/** 中断されたまま期限が切れたアップロードを片付ける（cron の purge から呼ぶ） */
export async function purgeStaleUploads(conn: DB) {
  const { and, lt, eq: eqq } = await import("drizzle-orm");
  const stale = await conn.select().from(s.uploads).where(and(eqq(s.uploads.status, "uploading"), lt(s.uploads.expiresAt, new Date())));
  for (const u of stale) {
    if (u.provider === "local") await rm(partPath(u.id), { force: true });
    await conn.delete(s.uploads).where(eqq(s.uploads.id, u.id));
  }
  return stale.length;
}

/* ---------------- local：ffmpeg で HLS（複数の解像度・ビットレート）に変換 ---------------- */

/** 画質の段（短い辺のピクセル数とビットレート）。元の動画より大きい段は作らない */
const LADDER = [
  { short: 360, kbps: 700 },
  { short: 540, kbps: 1400 },
  { short: 720, kbps: 2600 },
  { short: 1080, kbps: 4800 },
];
/** セグメントの長さ（秒）。短いほど再生開始と画質の切り替えが速い */
const SEGMENT_SEC = 2;

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`))));
  });
}

let ffmpegOk: Promise<boolean> | null = null;
export const hasFfmpeg = () => (ffmpegOk ??= run("ffmpeg", ["-version"]).then(() => true, () => false));

async function probe(file: string) {
  const out = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration", "-of", "json", file]);
  const j = JSON.parse(out) as { streams?: { width: number; height: number; side_data_list?: { rotation?: number }[] }[]; format?: { duration?: string } };
  const st = j.streams?.[0];
  if (!st) throw new Error("動画のトラックが見つかりません");
  const rot = Math.abs(st.side_data_list?.find((x) => x.rotation !== undefined)?.rotation ?? 0) % 180;
  const [w, h] = rot === 90 ? [st.height, st.width] : [st.width, st.height];
  return { width: w, height: h, durationMs: Math.round(Number(j.format?.duration ?? 0) * 1000) };
}

const sourceName = (mime: string) => `source.${mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : "mp4"}`;

async function transcodeLocal(conn: DB, id: string, srcName: string, hasPoster: boolean) {
  const dir = path.join(mediaDir(), id);
  const src = path.join(dir, srcName);
  if (!(await hasFfmpeg())) {
    // ffmpeg がない環境：元のファイルをそのまま配信（MP4 は Range で少しずつ読み込まれる）
    return markUpload(conn, id, { status: "ready", playbackUrl: localUrl(`${id}/${srcName}`), thumbnailUrl: hasPoster ? localUrl(`${id}/poster.jpg`) : null });
  }
  const info = await probe(src);
  const short = Math.min(info.width, info.height);
  const portrait = info.width <= info.height;
  const rungs = LADDER.filter((r) => r.short <= short);
  if (!rungs.length) rungs.push({ short: short - (short % 2), kbps: 600 });
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
  for (const r of rungs) {
    const out = path.join(dir, `${r.short}p`);
    await mkdir(out, { recursive: true });
    await run("ffmpeg", [
      "-y", "-v", "error", "-i", src, "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", portrait ? `scale=${r.short}:-2` : `scale=-2:${r.short}`,
      "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p",
      "-b:v", `${r.kbps}k`, "-maxrate", `${Math.round(r.kbps * 1.07)}k`, "-bufsize", `${r.kbps * 2}k`,
      "-force_key_frames", `expr:gte(t,n_forced*${SEGMENT_SEC})`, "-sc_threshold", "0",
      "-c:a", "aac", "-b:a", "96k", "-ac", "2",
      "-f", "hls", "-hls_time", String(SEGMENT_SEC), "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
      "-hls_segment_filename", path.join(out, "s%04d.ts"), path.join(out, "index.m3u8"),
    ]);
    const w = portrait ? r.short : Math.round((info.width / info.height) * r.short / 2) * 2;
    const h = portrait ? Math.round((info.height / info.width) * r.short / 2) * 2 : r.short;
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${(r.kbps + 96) * 1000},RESOLUTION=${w}x${h},CODECS="avc1.4d401f,mp4a.40.2"`, `${r.short}p/index.m3u8`);
  }
  await writeFile(path.join(dir, "master.m3u8"), lines.join("\n") + "\n");
  if (!hasPoster) {
    await run("ffmpeg", ["-y", "-v", "error", "-ss", String(Math.min(1, info.durationMs / 2000)), "-i", src, "-frames:v", "1", "-vf", "scale='min(540,iw)':-2", "-q:v", "4", path.join(dir, "poster.jpg")]).catch(() => {});
  }
  // 元ファイルは配信しないので消す（容量の節約）
  await rm(src, { force: true });
  return markUpload(conn, id, {
    status: "ready", width: info.width, height: info.height, durationMs: info.durationMs,
    playbackUrl: localUrl(`${id}/master.m3u8`), thumbnailUrl: localUrl(`${id}/poster.jpg`),
  });
}
