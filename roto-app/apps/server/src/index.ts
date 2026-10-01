import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@roto-app/api/routers/index";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createContext } from "./context";
import { env } from "./env.server";
import { cronLimiter, uploadLimiter } from "./lib/rate-limit";
import { cronRoutes } from "./routes/cron";
import { uploadRoutes } from "./routes/upload";
import { auth } from "./services";

// ponytail: Node built-in dotenv for infra URLs varlock skips (empty schema defaults); never overrides real env (prod)
try {
  process.loadEnvFile?.();
} catch {
  // prod provides env directly
}

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", async (c) => auth.handler(c.req.raw));

// ponytail: public path /api/upload and /api/cron/* reach the server as
// /upload and /cron/* (vercel.json strips the /api prefix except /api/auth).
// Rate limiters run before auth — cheap rejection first.
app.use("/upload", uploadLimiter);
app.route("/upload", uploadRoutes);

app.use("/cron/*", cronLimiter);
app.route("/cron", cronRoutes);

app.use("/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext({ context: c }),
  }),
);

app.get("/", (c) => {
  return c.text("OK");
});

// ponytail: thin health proxy for the local Valhalla container (B2). Reads VALHALLA_URL
// at call time (it may be unset in prod, where routing falls back to BRouter/OSRM) and
// never throws — a down or missing Valhalla just reports valhalla: null. Verbose status
// must be requested as a JSON body — `GET /status?verbose=true` is silently ignored by
// this Valhalla version, confirmed by testing against the container directly.
app.get("/status", async (c) => {
  const routeUrl = process.env.VALHALLA_URL;
  if (!routeUrl) return c.json({ valhalla: null });
  try {
    const base = routeUrl.replace(/\/route\/?$/, "");
    const r = await fetch(`${base}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verbose: true }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return c.json({ valhalla: null });
    return c.json({ valhalla: await r.json() });
  } catch {
    return c.json({ valhalla: null });
  }
});

import { serve } from "@hono/node-server";

export default app;

if (!process.env.VERCEL) {
  serve(
    {
      fetch: app.fetch,
      port: Number(process.env.PORT ?? 3000),
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    },
  );
}
