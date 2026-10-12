"use client";

/** Small fetch wrapper for client components: JSON in, JSON out, readable Chinese errors. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `请求失败（${res.status}）`);
  return data as T;
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "出错了，请重试";
}

export function countChars(text: string) {
  return [...text.replace(/\r?\n/g, "")].length;
}
