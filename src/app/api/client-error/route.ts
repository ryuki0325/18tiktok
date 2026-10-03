import { clientIpHash, rateLimit } from "@/lib/http";

/** ブラウザで起きたエラーをサーバーのログに残す（Render の Logs で確認できる） */
export async function POST(req: Request) {
  if (!(await rateLimit(`clienterr:${await clientIpHash()}`, 30, 3600).catch(() => true))) return new Response(null, { status: 204 });
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const pick = (k: string, n: number) => String(b[k] ?? "").slice(0, n);
    console.error(`[glow:client-error] ${pick("where", 40)} | ${pick("message", 500)} | ${pick("url", 300)} | ${pick("ua", 300)}\n${pick("stack", 1500)}`);
  } catch {}
  return new Response(null, { status: 204 });
}
