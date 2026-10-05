import { en } from "./en";
import { si } from "./si";
import { ta } from "./ta";
import type { Lang } from "../types";

export type { Strings } from "./en";
export type { Lang } from "../types";
export { en, si, ta };

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "si", label: "සිංහල" },
  { code: "ta", label: "தமிழ்" },
];

export const STR: Record<Lang, typeof en> = { en, si, ta };

/** `{m}`/`{km}` style interpolation for the distance templates (inMeters/inKm). */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = values[key];
    return v === undefined ? match : String(v);
  });
}
