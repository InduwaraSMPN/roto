// PDF theme constants (plan §4.7). The pdfcn theme presets are editorially neutral; Roto's
// identity colour is signal yellow `#FFB300` with `#1A1200` text, so the route line and chart
// use the app's own tokens rather than whatever accent a preset happens to pick. Kept in one
// place so the PDF and the on-screen recap cannot drift apart.
export const PDF_LINE_THEME = {
  /** Signal yellow — the only accent, same as the app. */
  signal: "#FFB300",
  /** Text on the signal colour. */
  onSignal: "#1A1200",
  /** Asphalt, for the road bed under the line. */
  asphalt: "#E5E7EB",
  /** Paper text. */
  ink: "#111827",
} as const;
