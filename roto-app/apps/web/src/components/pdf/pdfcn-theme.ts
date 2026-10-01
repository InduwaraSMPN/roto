import { professionalTheme } from "@/lib/pdf-themes/professional";

// Convenience re-export so callers can reach the active theme without knowing its folder.
// The registry's own copy imported from `@/components`, which does not resolve in this app.
export const theme = professionalTheme;
