// LK motorcycle brands sold / serviced locally (plan §5.3). Used by the dealer
// directory filter chips (native dealers.tsx) and garage brand pickers. Slugs are
// lowercase ASCII so they also build Riyasewana search URLs.
export type Brand = { slug: string; name: string };

export const BRANDS: Brand[] = [
  { slug: "bajaj", name: "Bajaj" },
  { slug: "hero", name: "Hero" },
  { slug: "honda", name: "Honda" },
  { slug: "yamaha", name: "Yamaha" },
  { slug: "tvs", name: "TVS" },
  { slug: "ktm", name: "KTM" },
  { slug: "voge", name: "Voge" },
  { slug: "zonsen", name: "Zonsen" },
  { slug: "lifan", name: "Lifan" },
  { slug: "haojue", name: "Haojue" },
  { slug: "suzuki", name: "Suzuki" },
  { slug: "revolt", name: "Revolt" },
  { slug: "demak", name: "Demak" },
];

export const BRAND_SLUGS = BRANDS.map((b) => b.slug);

/** `https://riyasewana.com/search/motorcycles/<brand>/<model>` (plan D13: link-out only). */
export function riyasewanaUrl(brandSlug: string, model?: string): string {
  const base = `https://riyasewana.com/search/motorcycles/${brandSlug.toLowerCase()}`;
  return model?.trim() ? `${base}/${model.trim().toLowerCase().replace(/\s+/g, "-")}` : base;
}
