"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, type RefObject } from "react";

import { haversineM, nearestOnLine } from "@roto-app/core/geo";
import type { LonLat, Waypoint } from "@roto-app/core/types";
import type { Planner } from "../_lib/use-planner";

// Structural mirror of RouteAttributeSegment (@roto-app/api lib/routing/attributes):
// the web client must not bundle server routing code, so the shape is redeclared here.
type SurfaceSegment = {
  speedLimitKph?: number;
  surface?: string;
  unpaved?: boolean;
  roadClass?: string;
  lengthKm?: number;
};

const ROUTE_SRC = "roto-route";
const ALT_SRC = "roto-alternatives";
const SURFACE_SRC = "roto-surface";

type Props = {
  waypoints: Waypoint[];
  onMoveWaypoint: (index: number, p: { lat: number; lon: number }) => void;
  onInsertWaypoint: (index: number, p: { lat: number; lon: number }) => void;
  main: LonLat[] | null;
  alternatives: LonLat[][];
  surface: SurfaceSegment[] | null;
  hoverDistM: number | null;
  styleUrl: string;
  mapRef: RefObject<maplibregl.Map | null>;
  t: Planner["t"];
};

function ensureLayers(m: maplibregl.Map) {
  if (!m.getSource(ROUTE_SRC)) {
    m.addSource(ROUTE_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: ROUTE_SRC, type: "line", source: ROUTE_SRC, paint: { "line-color": "#FFB300", "line-width": 4 } });
  }
  if (!m.getSource(ALT_SRC)) {
    m.addSource(ALT_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({
      id: ALT_SRC,
      type: "line",
      source: ALT_SRC,
      paint: { "line-color": "#8A94A0", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.8 },
    });
  }
  if (!m.getSource(SURFACE_SRC)) {
    m.addSource(SURFACE_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({
      id: SURFACE_SRC,
      type: "line",
      source: SURFACE_SRC,
      paint: { "line-color": ["get", "color"], "line-width": 7, "line-opacity": 0.55 },
    });
  }
}

// ponytail: trace_attributes returns per-edge stats without geometry, so chunks are
// equal splits of the route line — good enough to spot unpaved stretches, not survey data.
function surfaceFeatures(coords: LonLat[], segs: SurfaceSegment[]) {
  if (coords.length < 2 || !segs.length) return [];
  const per = Math.max(1, Math.floor(coords.length / segs.length));
  const features = [];
  for (let s = 0; s < segs.length; s++) {
    const line = coords.slice(s * per, s * per + per + 1);
    if (line.length < 2) continue;
    const seg = segs[s];
    features.push({
      type: "Feature",
      properties: { color: seg?.unpaved ? "#E5484D" : "rgba(138,148,160,0.0)" },
      geometry: { type: "LineString", coordinates: line },
    });
  }
  return features;
}

function pinEl(n: number, label: string): HTMLDivElement {
  const el = document.createElement("div");
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", label);
  el.style.cssText =
    "width:28px;height:28px;border-radius:50%;background:#FFB300;color:#1A1200;" +
    "font:800 14px/28px system-ui,sans-serif;text-align:center;cursor:grab;" +
    "border:2px solid #1A1200;outline-offset:2px;";
  el.addEventListener("focus", () => (el.style.outline = "2px solid #FFB300"));
  el.addEventListener("blur", () => (el.style.outline = "none"));
  el.textContent = String(n);
  return el;
}

export function PlannerMap({
  waypoints,
  onMoveWaypoint,
  onInsertWaypoint,
  main,
  alternatives,
  surface,
  hoverDistM,
  styleUrl,
  mapRef,
  t,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const hoverRef = useRef<maplibregl.Marker | null>(null);
  const stateRef = useRef({ waypoints, onMoveWaypoint, onInsertWaypoint, main, alternatives, surface });
  stateRef.current = { waypoints, onMoveWaypoint, onInsertWaypoint, main, alternatives, surface };

  // Create once; style swaps go through the styleUrl effect below.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const m = new maplibregl.Map({ container: elRef.current, style: styleUrl, center: [79.8612, 6.9271], zoom: 8 });
    mapRef.current = m;

    const draw = () => {
      ensureLayers(m);
      const s = stateRef.current;
      (m.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource)?.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: s.main ?? [] },
      } as never);
      (m.getSource(ALT_SRC) as maplibregl.GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: s.alternatives.map((coordinates) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates },
        })),
      } as never);
      (m.getSource(SURFACE_SRC) as maplibregl.GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: s.main && s.surface ? surfaceFeatures(s.main, s.surface) : [],
      } as never);
    };
    m.on("load", draw);
    m.on("style.load", draw);

    m.on("click", (e) => {
      const s = stateRef.current;
      if (s.main && s.main.length >= 2) {
        const hit = nearestOnLine(s.main, e.lngLat.lng, e.lngLat.lat);
        if (hit) {
          s.onInsertWaypoint(hit.index + 1, { lat: e.lngLat.lat, lon: e.lngLat.lng });
          return;
        }
      }
      s.onInsertWaypoint(s.waypoints.length, { lat: e.lngLat.lat, lon: e.lngLat.lng });
    });

    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Style switch: setStyle drops all sources, so re-add them on style.load.
  const firstStyle = useRef(styleUrl);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || firstStyle.current === styleUrl) {
      firstStyle.current = styleUrl;
      return;
    }
    firstStyle.current = styleUrl;
    m.setStyle(styleUrl);
  }, [styleUrl, mapRef]);

  // Redraw lines whenever data changes (draw() no-ops until the style is ready).
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const paint = () => {
      ensureLayers(m);
      (m.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: main ?? [] },
      } as never);
      (m.getSource(ALT_SRC) as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: alternatives.map((coordinates) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates },
        })),
      } as never);
      (m.getSource(SURFACE_SRC) as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: main && surface ? surfaceFeatures(main, surface) : [],
      } as never);
    };
    if (m.isStyleLoaded()) paint();
    else m.once("style.load", paint);
    if (main && main.length >= 2) {
      const b = main.reduce(
        (a, c) => a.extend(c as [number, number]),
        new maplibregl.LngLatBounds(main[0] as [number, number], main[0] as [number, number]),
      );
      m.fitBounds(b, { padding: 48, duration: 400 });
    }
  }, [main, alternatives, surface, mapRef]);

  // Draggable, keyboard-nudgeable waypoint pins.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    for (const mk of markersRef.current) mk.remove();
    markersRef.current = waypoints.map((w, i) => {
      const name = w.name ?? (i === 0 ? t.start : i === waypoints.length - 1 ? t.destination : `${t.stop} ${i}`);
      const el = pinEl(i + 1, `${name}: ${w.lat.toFixed(4)}, ${w.lon.toFixed(4)}. ${t.addStopHint}`);
      el.addEventListener("keydown", (ev) => {
        const step = 0.0007;
        const cur = stateRef.current.waypoints[i];
        if (!cur) return;
        if (ev.key === "ArrowUp") onMoveWaypoint(i, { lat: cur.lat + step, lon: cur.lon });
        else if (ev.key === "ArrowDown") onMoveWaypoint(i, { lat: cur.lat - step, lon: cur.lon });
        else if (ev.key === "ArrowLeft") onMoveWaypoint(i, { lat: cur.lat, lon: cur.lon - step });
        else if (ev.key === "ArrowRight") onMoveWaypoint(i, { lat: cur.lat, lon: cur.lon + step });
        else return;
        ev.preventDefault();
        ev.stopPropagation();
      });
      const mk = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([w.lon, w.lat]).addTo(m);
      mk.on("dragend", () => {
        const p = mk.getLngLat();
        onMoveWaypoint(i, { lat: p.lat, lon: p.lng });
      });
      return mk;
    });
  }, [waypoints, onMoveWaypoint, mapRef, t]);

  // Elevation-chart hover → dot on the route.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (hoverDistM === null || !main || main.length < 2) {
      hoverRef.current?.remove();
      hoverRef.current = null;
      return;
    }
    let acc = 0;
    let found: LonLat | null = main[0] ?? null;
    for (let i = 0; i < main.length - 1; i++) {
      const a = main[i];
      const b = main[i + 1];
      if (!a || !b) continue;
      const seg = haversineM(a[0], a[1], b[0], b[1]);
      if (acc + seg >= hoverDistM) {
        const f = seg > 0 ? (hoverDistM - acc) / seg : 0;
        found = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        break;
      }
      acc += seg;
    }
    if (found) {
      if (!hoverRef.current) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #FFB300;";
        hoverRef.current = new maplibregl.Marker({ element: el }).setLngLat(found).addTo(m);
      } else {
        hoverRef.current.setLngLat(found as [number, number]);
      }
    }
  }, [hoverDistM, main, mapRef]);

  return <div ref={elRef} role="application" aria-label={t.title} className="h-full min-h-[420px] w-full" />;
}
