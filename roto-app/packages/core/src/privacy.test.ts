import { describe, expect, it } from "vitest";
import { insideAny, maskInside, trimEnds } from "./privacy";
import type { Zone } from "./privacy";
import type { LonLat } from "./types";

const home: Zone = { lat: 6.93, lon: 79.86, radiusM: 300 };

describe("insideAny", () => {
  it("is true within the radius, false outside", () => {
    expect(insideAny(79.86, 6.93, [home])).toBe(true);
    expect(insideAny(80.0, 7.0, [home])).toBe(false);
  });
});

describe("trimEnds", () => {
  const coords: LonLat[] = [
    [79.86, 6.93], // inside home
    [79.861, 6.931], // inside home
    [79.9, 6.95], // outside
    [80.0, 7.0], // outside
    [79.861, 6.931], // inside home again (end)
  ];

  it("trims leading and trailing points inside a zone", () => {
    const out = trimEnds(coords, [home]);
    expect(out[0]).toEqual([79.9, 6.95]);
    expect(out[out.length - 1]).toEqual([80.0, 7.0]);
  });

  it("leaves a mid-route zone crossing alone", () => {
    const midCross: LonLat[] = [
      [79.9, 6.95],
      [79.86, 6.93], // passes through home mid-ride
      [80.0, 7.0],
    ];
    expect(trimEnds(midCross, [home])).toEqual(midCross);
  });

  it("is a no-op with no zones", () => {
    expect(trimEnds(coords, [])).toEqual(coords);
  });
});

describe("maskInside", () => {
  it("replaces every in-zone point with the zone center, including mid-route", () => {
    const coords: LonLat[] = [
      [79.86, 6.93],
      [79.9, 6.95],
      [79.861, 6.931],
    ];
    const out = maskInside(coords, [home]);
    expect(out[0]).toEqual([home.lon, home.lat]);
    expect(out[1]).toEqual([79.9, 6.95]);
    expect(out[2]).toEqual([home.lon, home.lat]);
  });
});
