import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@roto-app/api/routers/index";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createContext } from "./context";
import { env } from "./env.server";
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
