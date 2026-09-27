// ponytail: tiny CORS-enabled static server for style.json + sprite/ + fonts/.
// python -m http.server sends no Access-Control-Allow-Origin, so MapLibre (web :3001
// -> style :3006) gets blocked. Martin already sets CORS, so only this side needs it.
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.STYLE_PORT ?? 3006);

const TYPES = {
  ".json": "application/json",
  ".pbf": "application/x-protobuf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const target = join(ROOT, normalize(rel));

  // Never escape ROOT (../ traversal).
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "content-type": TYPES[extname(target)] ?? "application/octet-stream",
      "content-length": info.size,
      "access-control-allow-origin": "*",
      "cache-control": "no-cache",
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, { "access-control-allow-origin": "*" }).end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`style/sprite/fonts on http://localhost:${PORT} (root ${ROOT})`);
});
