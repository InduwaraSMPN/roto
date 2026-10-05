import { describe, expect, it } from "vitest";
import { coordsToGpx, toGpx } from "./gpx";
import { importRouteFile } from "./import/index";

describe("toGpx", () => {
  it("writes a valid GPX 1.1 document with trk, rte and wpt", () => {
    const xml = toGpx({
      name: "Test ride",
      track: [{ lon: 79.86, lat: 6.93, ele: 5, time: "2026-01-01T00:00:00Z" }],
      route: [{ lon: 79.86, lat: 6.93 }, { lon: 80.63, lat: 7.29 }],
      waypoints: [{ lon: 79.86, lat: 6.93, name: "Start" }],
    });
    expect(xml).toContain('<gpx version="1.1"');
    expect(xml).toContain("<trk>");
    expect(xml).toContain("<rte>");
    expect(xml).toContain('<wpt lat="6.93" lon="79.86">');
    expect(xml).toContain("<ele>5</ele>");
    expect(xml).toContain("<time>2026-01-01T00:00:00Z</time>");
    expect(xml).toContain("Test ride");
  });

  it("escapes special characters in names", () => {
    const xml = toGpx({ name: "R&D <ride>", track: [{ lon: 1, lat: 2 }] });
    expect(xml).toContain("R&amp;D &lt;ride&gt;");
  });
});

describe("GPX round trip through importRouteFile", () => {
  it("re-imports a track written by coordsToGpx", async () => {
    const coords: [number, number][] = [
      [79.8612, 6.9271],
      [79.9, 6.95],
      [80.6337, 7.2906],
    ];
    const xml = coordsToGpx(coords, "Round trip", "track");
    const bytes = new TextEncoder().encode(xml);
    const imported = await importRouteFile("ride.gpx", bytes);
    expect(imported.tracks).toHaveLength(1);
    expect(imported.tracks[0]).toHaveLength(coords.length);
    imported.tracks[0]?.forEach(([lon, lat], i) => {
      expect(lon).toBeCloseTo(coords[i]?.[0] ?? 0, 5);
      expect(lat).toBeCloseTo(coords[i]?.[1] ?? 0, 5);
    });
  });

  it("re-imports a route (<rte>) as `routes`, not `tracks`", async () => {
    const xml = coordsToGpx(
      [
        [79.86, 6.93],
        [80.0, 7.0],
      ],
      "Planned",
      "route",
    );
    const imported = await importRouteFile("route.gpx", new TextEncoder().encode(xml));
    expect(imported.routes).toHaveLength(1);
    expect(imported.tracks).toHaveLength(0);
  });
});
