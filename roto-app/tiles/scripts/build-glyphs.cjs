// ponytail: one-shot build script, not app code. Run: node scripts/build-glyphs.js
const fontnik = require("fontnik");
const fs = require("fs");
const path = require("path");

const FONTS = {
  "Noto Sans Regular": "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
  "Noto Sans Bold": "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
  "Noto Sans Sinhala Regular": "/usr/share/fonts/truetype/noto/NotoSansSinhala-Regular.ttf",
  "Noto Sans Sinhala Bold": "/usr/share/fonts/truetype/noto/NotoSansSinhala-Bold.ttf",
  "Noto Sans Tamil Regular": "/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf",
  "Noto Sans Tamil Bold": "/usr/share/fonts/truetype/noto/NotoSansTamil-Bold.ttf",
};

const OUT = path.join(__dirname, "..", "tiles", "fonts");
const range = (font, start) =>
  new Promise((res, rej) => fontnik.range({ font, start, end: start + 255 }, (e, z) => (e ? rej(e) : res(z))));

(async () => {
  for (const [stack, file] of Object.entries(FONTS)) {
    const font = fs.readFileSync(file);
    const dir = path.join(OUT, stack);
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    for (let s = 0; s < 65536; s += 256) {
      const buf = await range(font, s);
      fs.writeFileSync(path.join(dir, `${s}-${s + 255}.pbf`), buf);
      n++;
    }
    console.log(stack, n, "ranges");
  }
})().catch((e) => { console.error(e); process.exit(1); });
