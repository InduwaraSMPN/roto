// Server-side tRPC caller for route handlers. The browser client (src/utils/trpc.ts) resolves
// a relative URL and attaches cookies; a server route has neither, so it needs an absolute URL
// and no credentials. No transformer in this repo, so inputs are plain JSON.
//
// ponytail: one caller, no cache. Route handlers here render a PDF or an OG image, both
// single-shot; add a cache layer only if a public page starts calling this per request.
import type { AppRouter } from "@roto-app/api/routers/index";
import { createTRPCClient, httpLink } from "@trpc/client";

function serverBaseUrl(): string {
  const processEnv = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  const raw = processEnv?.SERVER_URL ?? processEnv?.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";
  const base = raw.startsWith("/") ? `http://localhost:3000${raw}` : raw;
  return base.replace(/\/$/, "");
}

const client = createTRPCClient<AppRouter>({
  links: [httpLink({ url: `${serverBaseUrl()}/trpc`, fetch: (url, options) => fetch(url, options) })],
});

export const serverTrpc = client;
