import { describe, expect, it } from "vitest";
import { destination } from "./geo";
import { curvatureScore, curvatureSegments, segmentCorners, upcomingCurves } from "./curvature";
import type { LonLat } from "./types";

function straightLine(n: number, stepM = 200): LonLat[] {
  const out: LonLat[] = [[79.86, 6.93]];
  for (let i = 1; i < n; i++) {
    const last = out[i - 1];
    if (!last) continue;
    out.push(destination(last[0], last[1], 90, stepM));
  }
  return out;
}

/** A tight zig-zag: alternates 90-degree turns every ~30m, i.e. a very twisty road. */
function zigzagLine(n: number, stepM = 30): LonLat[] {
  const out: LonLat[] = [[79.86, 6.93]];
  let bearing = 90;
  for (let i = 1; i < n; i++) {
    const last = out[i - 1];
    if (!last) continue;
    bearing = bearing === 90 ? 0 : 90;
    out.push(destination(last[0], last[1], bearing, stepM));
  }
  return out;
}

describe("curvatureScore", () => {
  it("is ~0 for a straight line", () => {
    expect(curvatureScore(straightLine(20))).toBe(0);
  });

  it("is much higher for a tight zig-zag than a straight line of similar length", () => {
    const straight = curvatureScore(straightLine(20, 30));
    const zigzag = curvatureScore(zigzagLine(20, 30));
    expect(zigzag).toBeGreaterThan(straight);
    expect(zigzag).toBeGreaterThan(0);
  });
});

describe("curvatureSegments", () => {
  it("returns one entry per interior point", () => {
    const coords = straightLine(5);
    expect(curvatureSegments(coords)).toHaveLength(coords.length - 2);
  });
});

describe("segmentCorners", () => {
  it("finds no corners on a straight line", () => {
    expect(segmentCorners(straightLine(20))).toHaveLength(0);
  });

  it("finds corners on a zig-zag", () => {
    const corners = segmentCorners(zigzagLine(20, 30));
    expect(corners.length).toBeGreaterThan(0);
    for (const c of corners) expect(c.minRadiusM).toBeLessThan(1750);
  });
});

describe("upcomingCurves", () => {
  it("only returns corners ahead of fromIdx within aheadM", () => {
    const coords = zigzagLine(30, 30);
    const all = upcomingCurves(coords, 0, 100000);
    const nearOnly = upcomingCurves(coords, 0, 60);
    expect(nearOnly.length).toBeLessThanOrEqual(all.length);
    for (const c of nearOnly) expect(c.startIdx).toBeGreaterThanOrEqual(0);
  });

  it("excludes corners behind fromIdx", () => {
    const coords = zigzagLine(30, 30);
    const fromMiddle = upcomingCurves(coords, 15, 100000);
    for (const c of fromMiddle) expect(c.startIdx).toBeGreaterThanOrEqual(15);
  });
});
