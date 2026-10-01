// ponytail: tiny CORS-enabled static server for style.json + sprite/ + fonts/.
// python -m http.server sends no Access-Control-Allow-Origin, so MapLibre (web :3001
// -> style :3006) gets blocked. Martin already sets CORS, so only this side needs it.
//
// style.json is generated from style.template.json at request time (B9): the template
// has {{TILE_HOST}} (martin, :3005) and {{STYLE_HOST}} (this server, :3006) placeholders
// instead of hardcoded localhost, so phones on the LAN get working tile/glyph/sprite URLs.
// Host comes from STYLE_PUBLIC_HOST (e.g. "192.168.1.5") or falls back to the request's
// own Host header hostname (works for localhost dev and LAN devices without config).
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { PbfReader, PbfWriter } from "pbf";

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.STYLE_PORT ?? 3006);
const MARTIN_PORT = Number(process.env.MARTIN_PORT ?? 3005);
const TEMPLATE_PATH = join(ROOT, "style.template.json");

const TYPES = {
  ".json": "application/json",
  ".pbf": "application/x-protobuf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function publicHost(req) {
  if (process.env.STYLE_PUBLIC_HOST) return process.env.STYLE_PUBLIC_HOST;
  const hostHeader = req.headers.host ?? `localhost:${PORT}`;
  return hostHeader.replace(/:\d+$/, "");
}

async function renderStyle(req) {
  const host = publicHost(req);
  const template = await readFile(TEMPLATE_PATH, "utf8");
  return template
    .replaceAll('["get", "score"]', '"score"')
    .replaceAll("{{TILE_HOST}}", `http://${host}:${MARTIN_PORT}`)
    .replaceAll("{{STYLE_HOST}}", `http://${host}:${PORT}`);
}

async function compositeGlyphs(fontStack, range) {
  const glyphs = new Map();
  for (const font of fontStack.split(",")) {
    const file = join(ROOT, "fonts", font, range);
    const data = await readFile(file).catch(() => readFile(join(ROOT, "fonts", "Noto Sans Regular", range)).catch(() => null));
    if (!data) continue;
    new PbfReader(data).readFields((tag, _, pbf) => {
      if (tag !== 1) return;
      pbf.readMessage((field, __, stack) => {
        if (field !== 3) return;
        const bytes = stack.readBytes();
        let id;
        new PbfReader(bytes).readFields((glyphField, ___, glyph) => {
          if (glyphField === 1) id = glyph.readVarint();
        }, {});
        if (id !== undefined && !glyphs.has(id)) glyphs.set(id, bytes);
      }, {});
    }, {});
  }
  if (!glyphs.size) return null;
  const writer = new PbfWriter();
  writer.writeMessage(1, (_, stack) => {
    stack.writeStringField(1, fontStack);
    stack.writeStringField(2, range.replace(/\.pbf$/, ""));
    for (const bytes of glyphs.values()) stack.writeBytesField(3, bytes);
  }, {});
  return writer.finish();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/style.json") {
    try {
      const body = await renderStyle(req);
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "no-cache",
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { "access-control-allow-origin": "*" }).end(String(err));
    }
    return;
  }

  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const glyph = /^fonts\/([^/]*,[^/]*)\/(\d+-\d+\.pbf)$/.exec(rel);
  if (glyph) {
    const body = await compositeGlyphs(glyph[1], glyph[2]);
    res.writeHead(body ? 200 : 404, { "content-type": TYPES[".pbf"], "access-control-allow-origin": "*" }).end(body ?? "not found");
    return;
  }
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
