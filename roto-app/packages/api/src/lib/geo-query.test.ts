import { describe, expect, it } from "vitest";
import { SQL } from "drizzle-orm";
import {
  alongRouteWhere,
  bboxIntersects,
  bboxWhere,
  downsampleIndices,
  kmToDegLat,
  kmToDegLon,
  nearOrder,
  nearWhere,
  routeBbox,
  routeLineWkt,
} from "./geo-query";
import { pois } from "@roto-app/db/schema/pois";

describe("downsampleIndices", () => {
  it("returns every index when under the cap", () => {
    expect(downsampleIndices(5, 10)).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps first and last index when capped", () => {
    const idx = downsampleIndices(100, 10);
    expect(idx).toHaveLength(10);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(99);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("handles edge cases", () => {
    expect(downsampleIndices(0, 10)).toEqual([]);
    expect(downsampleIndices(5, 0)).toEqual([]);
    expect(downsampleIndices(5, 1)).toEqual([0]);
    expect(downsampleIndices(1, 10)).toEqual([0]);
  });
});

describe("routeBbox", () => {
  it("bounds the coords in [minLon, minLat, maxLon, maxLat] order", () => {
    expect(
      routeBbox([
        [79.86, 6.92],
        [80.63, 7.29],
        [80.22, 6.05],
      ]),
    ).toEqual([79.86, 6.05, 80.63, 7.29]);
  });

  it("pads by padDeg", () => {
    expect(routeBbox([[80, 7]], 0.5)).toEqual([79.5, 6.5, 80.5, 7.5]);
  });
});

describe("routeLineWkt", () => {
  it("emits lon-lat pairs at fixed precision", () => {
    expect(
      routeLineWkt([
        [79.8612, 6.9271],
        [80.6337, 7.2906],
      ]),
    ).toBe("LINESTRING(79.861200 6.927100, 80.633700 7.290600)");
  });
});

describe("kmToDeg", () => {
  it("converts km to degrees near LK latitudes", () => {
    expect(kmToDegLat(111.32)).toBeCloseTo(1, 5);
    // A degree of longitude is shorter than a degree of latitude off-equator.
    expect(kmToDegLon(100, 8)).toBeGreaterThan(kmToDegLat(100));
  });
});

describe("sql builders", () => {
  it("return drizzle SQL fragments", () => {
    const bbox = bboxWhere(pois.lat, pois.lon, [79, 6, 81, 8]);
    expect(bbox).toBeInstanceOf(SQL);
    expect(bboxIntersects(pois.geom, [79, 6, 81, 8])).toBeInstanceOf(SQL);
    expect(nearWhere(pois.geom, pois.lat, pois.lon, { lat: 7, lon: 80 }, 5)).toBeInstanceOf(SQL);
    expect(
      alongRouteWhere(
        pois.geom,
        pois.lat,
        pois.lon,
        [
          [79.86, 6.92],
          [80.63, 7.29],
        ],
        500,
      ),
    ).toBeInstanceOf(SQL);
    expect(nearOrder(pois.geom, 80, 7)).toBeInstanceOf(SQL);
  });
});
