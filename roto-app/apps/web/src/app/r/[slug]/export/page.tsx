// Route export. Primary artefact is the server-rendered PDF at
// /api/route-pdf/<slug> (takumi-pdf + pdfcn, plan §4.7): real vector text, embedded
// Noto Sans Sinhala/Tamil subsets, so the si/ta sheets print correctly. The print-CSS
// view below stays as the zero-dependency fallback and the on-screen preview.
//
// ponytail: the map canvas is not snapshotted into the PDF — maplibre is not configured
// with preserveDrawingBuffer, so a canvas grab comes out blank. The PDF draws the route
// line from the coordinates as SVG instead, which is sharper anyway.
"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Download, FileText, Printer, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@roto-app/ui/components/alert";
import { Button, buttonVariants } from "@roto-app/ui/components/button";
import { Skeleton } from "@roto-app/ui/components/skeleton";
import { cn } from "@roto-app/ui/lib/utils";

import { RouteTrace } from "@/components/route-trace";
import { futureQuery } from "@/lib/future";
import { useLang } from "@/lib/lang";

type SharedRoute = {
  name?: string;
  coords?: [number, number][] | null;
  maneuvers?: { instruction?: string; lengthKm?: number }[] | null;
  km?: number | null;
  min?: number | null;
};

const COPY = {
  en: {
    pdf: "Download PDF",
    print: "Print",
    hint: "The PDF is a server-rendered vector document with Sinhala and Tamil text embedded.",
  },
  si: {
    pdf: "PDF බාගන්න",
    print: "මුද්‍රණය කරන්න",
    hint: "PDF එක server එකෙන් නිර්මාණය කරන vector ලේඛනයකි, සිංහල සහ දෙමළ අකුරු ඇතුළත්.",
  },
  ta: {
    pdf: "PDF பதிவிறக்கு",
    print: "அச்சிடு",
    hint: "PDF என்பது சர்வர் தோற்றத்தில் உருவான வெக்டர் ஆவணம், தமிழ் எழுத்துகள் உள்ளடக்கியது.",
  },
} as const;

export default function RouteExportPage() {
  const { slug } = useParams<{ slug: string }>();
  const { lang } = useLang();
  const t = COPY[lang];
  const shared = useQuery({
    queryKey: ["routes-bySlug", slug],
    queryFn: () => futureQuery<SharedRoute>("routes.bySlug", { slug }),
    retry: false,
  });
  const route = (shared.data ?? null) as SharedRoute | null;
  const coords =
    route?.coords && Array.isArray(route.coords) && route.coords.length > 1
      ? (route.coords as [number, number][])
      : null;
  const maneuvers = Array.isArray(route?.maneuvers) ? route!.maneuvers! : [];

  if (shared.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 print:hidden">
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }
  if (shared.isError || !route || !coords) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Route unavailable for export.</AlertTitle>
          <AlertDescription>The route may be private or the sharing backend is still being built.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 print:max-w-none print:px-0 print:py-0 print:text-black">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="max-w-[46ch] text-sm text-muted-foreground">{t.hint}</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => window.print()}
            className="h-10 font-bold"
          >
            <Printer />
            {t.print}
          </Button>
          <a
            href={`/api/route-pdf/${encodeURIComponent(slug)}?lang=${lang}`}
            target="_blank"
            rel="noopener"
            className={cn(buttonVariants(), "h-10 font-bold")}
          >
            <FileText />
            {t.pdf}
          </a>
        </div>
      </div>

      <header className="border-b pb-4">
        <p className="text-sm font-bold tracking-widest text-muted-foreground print:text-black">ROTO · ROUTE EXPORT</p>
        <h1 className="mt-1 text-3xl font-black">{route.name ?? slug}</h1>
        <p className="numerals mt-1 text-lg">
          {route.km != null ? `${route.km.toFixed(0)} km` : ""}{" "}
          {route.min != null ? `· ${Math.round(route.min)} min` : ""}
        </p>
      </header>

      <div className="mt-6">
        <RouteTrace coords={coords} label={`Route line of ${route.name ?? slug}`} />
      </div>

      <h2 className="mt-8 text-xl font-bold">Turn-by-turn</h2>
      {maneuvers.length === 0 ? (
        <p className="mt-2 text-sm">No maneuver steps — follow the yellow line.</p>
      ) : (
        <ol className="mt-2 grid gap-1.5">
          {maneuvers.map((m, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                <span className="numerals mr-2">{i + 1}.</span>
                {m.instruction ?? "Continue"}
              </span>
              {m.lengthKm != null && <span className="numerals shrink-0">{m.lengthKm.toFixed(1)} km</span>}
            </li>
          ))}
        </ol>
      )}

      <h2 className="mt-8 text-xl font-bold">Emergency numbers (Sri Lanka)</h2>
      <ul className="mt-2 grid gap-1 text-sm">
        <li>Police — 119</li>
        <li>Ambulance (Suwa Seriya) — 1990</li>
        <li>Fire — 110</li>
      </ul>
      <p className="mt-6 text-xs text-muted-foreground print:text-black">
        Map data © OpenMapTiles © OpenStreetMap contributors · Exported from Roto, free forever.
      </p>
      <p className="mt-1 text-xs text-muted-foreground print:hidden">
        <Download aria-hidden className="mr-1 inline size-3" />
        <a href={`/api/route-pdf/${encodeURIComponent(slug)}?lang=${lang}`} target="_blank" rel="noopener" className="underline underline-offset-2">
          {t.pdf}
        </a>
      </p>
    </div>
  );
}
