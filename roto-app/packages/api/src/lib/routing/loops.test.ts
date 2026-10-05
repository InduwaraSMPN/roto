import { bearing, haversineM } from "@roto-app/core/geo";
import { describe, expect, it } from "vitest";
import { roundTripPoints } from "./loops";

describe("roundTripPoints (B15: proper spherical destination, no flat cos(lat) approximation)", () => {
  const center = { lat: 6.9271, lon: 79.8612 }; // Colombo

  it("returns center -> N bearings -> center, closed", () => {
    const pts = roundTripPoints(center, 20, [0, 120, 240]);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual(center);
    expect(pts[pts.length - 1]).toEqual(center);
  });

  it("places each leg point ~legKm from the center, in the requested bearing", () => {
    const legKm = 25;
    const pts = roundTripPoints(center, legKm, [0, 90, 180]);
    const north = pts[1];
    const east = pts[2];
    const south = pts[3];
    expect(north && haversineM(center.lon, center.lat, north.lon, north.lat) / 1000).toBeCloseTo(legKm, 1);
    expect(east && haversineM(center.lon, center.lat, east.lon, east.lat) / 1000).toBeCloseTo(legKm, 1);
    expect(south && haversineM(center.lon, center.lat, south.lon, south.lat) / 1000).toBeCloseTo(legKm, 1);
    // bearing back from center should roughly match the requested bearing
    if (north) expect(bearing(center.lon, center.lat, north.lon, north.lat)).toBeCloseTo(0, 0);
    if (east) expect(bearing(center.lon, center.lat, east.lon, east.lat)).toBeCloseTo(90, 0);
  });

  it("does not degenerate into an oval at low latitudes the way the old cos(lat)-naive version could", () => {
    // Sanity check: a 90-degree bearing point and a 0-degree bearing point at the same
    // legKm are equidistant from the center (a real bug would skew one of these).
    const legKm = 40;
    const pts = roundTripPoints(center, legKm, [0, 90]);
    const north = pts[1];
    const east = pts[2];
    expect(north && east).toBeTruthy();
    if (north && east) {
      const dNorth = haversineM(center.lon, center.lat, north.lon, north.lat);
      const dEast = haversineM(center.lon, center.lat, east.lon, east.lat);
      expect(Math.abs(dNorth - dEast)).toBeLessThan(50); // meters
    }
  });
});
