import { describe, expect, it } from "vitest";
import { bbox, decodePolyline6, destination, haversineM, lineLengthKm, nearestOnLine, pointToSegmentM, simplify } from "./geo";

describe("haversineM", () => {
  it("is ~0 for the same point", () => {
    expect(haversineM(79.86, 6.93, 79.86, 6.93)).toBeCloseTo(0, 3);
  });

  it("matches the known Colombo -> Kandy great-circle distance (~93.5 km)", () => {
    const km = haversineM(79.8612, 6.9271, 80.6337, 7.2906) / 1000;
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(97);
  });
});

describe("destination", () => {
  it("round-trips with haversineM (destination 10km north is ~10km away)", () => {
    const [lon, lat] = destination(79.86, 6.93, 0, 10000);
    expect(haversineM(79.86, 6.93, lon, lat)).toBeCloseTo(10000, -1);
    expect(lat).toBeGreaterThan(6.93); // north = higher latitude
  });

  it("moving east increases longitude, not latitude", () => {
    const [lon, lat] = destination(79.86, 6.93, 90, 5000);
    expect(lon).toBeGreaterThan(79.86);
    expect(lat).toBeCloseTo(6.93, 2);
  });
});

describe("pointToSegmentM", () => {
  it("is ~0 for a point on the segment", () => {
    const hit = pointToSegmentM(79.87, 6.93, 79.86, 6.93, 79.88, 6.93);
    expect(hit.distM).toBeLessThan(5);
    expect(hit.t).toBeGreaterThan(0.4);
    expect(hit.t).toBeLessThan(0.6);
  });

  it("clamps t to the endpoints", () => {
    const hit = pointToSegmentM(79.5, 6.93, 79.86, 6.93, 79.88, 6.93);
    expect(hit.t).toBe(0);
  });
});

describe("nearestOnLine", () => {
  it("finds the right segment and a small distance for an on-line point", () => {
    const coords: [number, number][] = [
      [79.86, 6.93],
      [79.87, 6.93],
      [79.88, 6.93],
    ];
    const hit = nearestOnLine(coords, 79.875, 6.9301);
    expect(hit).not.toBeNull();
    expect(hit?.index).toBe(1);
    expect(hit?.distM).toBeLessThan(50);
  });

  it("returns null for lines shorter than 2 points", () => {
    expect(nearestOnLine([[79.86, 6.93]], 79.86, 6.93)).toBeNull();
  });
});

describe("lineLengthKm", () => {
  it("sums segment lengths", () => {
    const coords: [number, number][] = [
      [79.86, 6.93],
      [79.87, 6.93],
      [79.88, 6.93],
    ];
    expect(lineLengthKm(coords)).toBeCloseTo(lineLengthKm(coords.slice(0, 2)) + lineLengthKm(coords.slice(1)), 5);
  });
});

describe("bbox", () => {
  it("finds the min/max extents", () => {
    const coords: [number, number][] = [
      [79.86, 6.93],
      [80.0, 7.0],
      [79.5, 6.5],
    ];
    expect(bbox(coords)).toEqual([79.5, 6.5, 80.0, 7.0]);
  });
});

// Minimal test-only encoder mirroring the Google/Valhalla polyline algorithm, so the round trip
// is checked against our own decoder rather than a hand-typed (and easy to get wrong) literal.
function encodePolyline6(points: [number, number][], precision = 6): string {
  const f = 10 ** precision;
  let prevLat = 0;
  let prevLon = 0;
  let out = "";
  const encodeValue = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = "";
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return chunk + String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of points) {
    const lat5 = Math.round(lat * f);
    const lon5 = Math.round(lon * f);
    out += encodeValue(lat5 - prevLat) + encodeValue(lon5 - prevLon);
    prevLat = lat5;
    prevLon = lon5;
  }
  return out;
}

describe("decodePolyline6", () => {
  it("round-trips through a matching encoder", () => {
    const points: [number, number][] = [
      [79.8612, 6.9271],
      [79.87, 6.93],
      [80.6337, 7.2906],
    ];
    const decoded = decodePolyline6(encodePolyline6(points));
    expect(decoded).toHaveLength(points.length);
    decoded.forEach(([lon, lat], i) => {
      expect(lon).toBeCloseTo(points[i]?.[0] ?? 0, 5);
      expect(lat).toBeCloseTo(points[i]?.[1] ?? 0, 5);
    });
  });
});

describe("simplify", () => {
  it("keeps endpoints and drops collinear midpoints", () => {
    const coords: [number, number][] = [
      [79.86, 6.93],
      [79.87, 6.93],
      [79.88, 6.93],
      [79.89, 6.93],
    ];
    const out = simplify(coords, 5);
    expect(out[0]).toEqual(coords[0]);
    expect(out[out.length - 1]).toEqual(coords[coords.length - 1]);
    expect(out.length).toBeLessThan(coords.length);
  });

  it("keeps a real corner", () => {
    const coords: [number, number][] = [
      [79.86, 6.93],
      [79.87, 6.93],
      [79.87, 7.0], // sharp turn north
    ];
    const out = simplify(coords, 5);
    expect(out).toHaveLength(3);
  });
});
