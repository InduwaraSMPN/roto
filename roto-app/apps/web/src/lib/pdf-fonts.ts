// Font registration for PDF documents (plan §4.7, §5.1).
//
// takumi-pdf embeds real font subsets and throws "No registered font covers U+XXXX" when a
// glyph has no coverage. The Latin-only pdfcn theme (Helvetica / Times-Roman) cannot draw
// Sinhala or Tamil, so the si/ta route sheet needs Noto Sans Sinhala and Noto Sans Tamil
// registered alongside the Latin face.
//
// ponytail: fetched from Google Fonts on first use and memoised for the process lifetime.
// Self-host the woff2 files in `public/pdf-fonts/` and switch to `fontFromUrl` if a deploy
// environment has no outbound network.
import { googleFonts } from "@takumi-rs/helpers";
import type { FontSubset } from "@takumi-rs/helpers";

/** Latin body/heading face plus the two LK scripts. Order matters only for readability. */
const FONT_FAMILIES = ["Noto Sans", "Noto Sans Sinhala", "Noto Sans Tamil"] as const;

let cached: Promise<FontSubset[]> | null = null;

/** Memoised across requests; takumi re-uses registered families, so repeat calls are cheap. */
export function pdfFonts(): Promise<FontSubset[]> {
  if (!cached) {
    cached = googleFonts([...FONT_FAMILIES]).catch((err) => {
      // A font fetch failure must not take the whole export down: Latin still renders.
      console.error("[pdf] font load failed, falling back to built-in faces", err);
      return [];
    });
  }
  return cached;
}
