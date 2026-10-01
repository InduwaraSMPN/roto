// ponytail: one shared maplibre-gl line map for every read-only page (t/r/ride/routes).
// Interactive planning stays in app/plan (planner-agent owned) — this component never
// edits a route, so it cannot drift from the planner's behavior.
"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

const STYLE = process.env.NEXT_PUBLIC_TILE_URL || "https://demotiles.maplibre.org/style.json";

export type MapMarker = { lon: number; lat: number; label?: string };

function boundsOf(coords: [number, number][]) {
  const b = new maplibregl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]);
  for (const c of coords) b.extend(c as [number, number]);
  return b;
}

export default function RouteMap({
  coords,
  marker,
  heat,
  showHeat,
  ariaLabel,
}: {
  coords?: [number, number][] | null;
  marker?: MapMarker | null;
  heat?: [number, number][] | null;
  showHeat?: boolean;
  ariaLabel: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    map.current = new maplibregl.Map({
      container: mapEl.current,
      style: STYLE,
      center: [79.8612, 6.9271],
      zoom: 8,
    });
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Route line (+ optional heat layer): redrawn whenever the data identity changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const line = coords && coords.length > 1 ? coords : null;
    const draw = () => {
      if (!m.getSource("roto-route")) {
        m.addSource("roto-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "roto-route", type: "line", source: "roto-route", paint: { "line-color": "#FFB300", "line-width": 4 } });
      }
      const src = m.getSource("roto-route") as maplibregl.GeoJSONSource;
      src.setData(
        line
          ? ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } } as never)
          : ({ type: "FeatureCollection", features: [] } as never),
      );
      if (m.getLayer("roto-heat")) m.removeLayer("roto-heat");
      if (m.getSource("roto-heat-src")) m.removeSource("roto-heat-src");
      if (showHeat && heat?.length) {
        m.addSource("roto-heat-src", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: heat.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } })),
          } as never,
        });
        m.addLayer({
          id: "roto-heat",
          type: "heatmap",
          source: "roto-heat-src",
          paint: { "heatmap-weight": 1, "heatmap-intensity": 1, "heatmap-radius": 24 },
        });
      }
      if (line) m.fitBounds(boundsOf(line), { padding: 40 });
    };
    if (m.loaded()) draw();
    else m.once("load", draw);
  }, [coords, heat, showHeat]);

  // Live/replay marker follows props without refitting the map.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!marker) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const el = document.createElement("div");
    el.setAttribute("role", "img");
    if (marker.label) el.setAttribute("aria-label", marker.label);
    el.style.cssText =
      "width:18px;height:18px;border-radius:50%;background:#FFB300;border:3px solid #1A1200;box-shadow:0 0 0 2px #FFB30055";
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ element: el }).setLngLat([marker.lon, marker.lat]).addTo(m);
    } else {
      markerRef.current.setLngLat([marker.lon, marker.lat]);
    }
  }, [marker]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={mapEl} role="application" aria-label={ariaLabel} className="h-[60vh] min-h-[320px] w-full overflow-hidden rounded-2xl border" />
      <p className="text-xs text-muted-foreground">Map data © OpenMapTiles © OpenStreetMap contributors</p>
    </div>
  );
}
