"use client";
export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; status: number; data: T & { error?: { message: string } } }> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let data: T & { error?: { message: string } };
  try { data = await res.json(); } catch { data = {} as T & { error?: { message: string } }; }
  return { ok: res.ok, status: res.status, data };
}
