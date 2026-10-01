// ponytail: the server grows routers in parallel (routes, community, challenges,
// moderation, fuel, holidays, pois, rides share/heat, privacy export/delete). This
// untyped fetch caller keeps web check-types green whether or not a procedure exists
// yet — every call site wraps it in try/catch and renders a fallback. Pages light up
// on their own once the parallel backend lands. Remove once AppRouter covers them.
// next-intl: SKIP (D4 open) — see lib/lang.tsx. Serwist PWA: SKIP (D10 open) — note only.
function serverBase(): string {
  // Next inlines process.env.NEXT_PUBLIC_* at build time; the varlock ENV proxy is
  // not always hydrated in the client bundle, so prefer the inlined literal.
  const resolved = process.env.NEXT_PUBLIC_SERVER_URL ?? "";
  const normalized = resolved.endsWith("/") ? resolved.slice(0, -1) : resolved;
  if (!normalized.startsWith("/")) return normalized;
  if (typeof window !== "undefined") return `${window.location.origin}${normalized}`;
  return `http://localhost:3000${normalized}`;
}

function throwIfRpcError(item: unknown): unknown {
  const err = (item as { error?: { message?: string; data?: { code?: string } } })?.error;
  if (err) {
    const code = err.data?.code ? ` (${err.data.code})` : "";
    throw new Error(`${err.message ?? "request failed"}${code}`);
  }
  return (item as { result?: { data?: unknown } })?.result?.data;
}

// No transformer on tRPC: batch inputs are raw JSON, Dates arrive as strings.
export async function futureQuery<T>(path: string, input?: unknown): Promise<T> {
  const base = `${serverBase()}/trpc/${path}?batch=1`;
  const url = input === undefined ? base : `${base}&input=${encodeURIComponent(JSON.stringify({ "0": input }))}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  const json: unknown = await res.json();
  return throwIfRpcError((json as unknown[])[0]) as T;
}

export async function futureMutate<T>(path: string, input?: unknown): Promise<T> {
  const res = await fetch(`${serverBase()}/trpc/${path}?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ "0": input ?? {} }),
  });
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  const json: unknown = await res.json();
  return throwIfRpcError((json as unknown[])[0]) as T;
}

/** True when the failure means "backend procedure not built yet" vs a real error. */
export function isMissingProcedure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /no procedure|NOT_FOUND|unknown|404/.test(msg);
}
