import { afterEach, describe, expect, it, vi } from "vitest";
import { planRoute } from "./index";

describe("planRoute engine chain (VALHALLA_URL unset -> BRouter, mocked network)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VALHALLA_URL;
  });

  it("falls through to BRouter and reports degraded capabilities (no maneuvers/speedLimits/surface)", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("brouter.de")) {
        return new Response(
          JSON.stringify({
            features: [
              {
                type: "Feature",
                properties: { "track-length": "15000", "total-time": "1800" },
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [79.86, 6.93],
                    [80.0, 7.0],
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // legacy positional overload, as used by packages/db/src/seed/curated.ts
    const result = await planRoute([{ lat: 6.93, lon: 79.86 }, { lat: 7.0, lon: 80.0 }], 0.5);

    expect(result.engine).toBe("brouter");
    expect(result.km).toBe(15);
    expect(result.min).toBe(30);
    expect(result.capabilities).toEqual({ maneuvers: false, elevation: false, speedLimits: false, surface: false });
  });

  it("falls through to OSRM (with steps=true, B14) when BRouter also fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("brouter.de")) throw new Error("brouter down");
      if (url.includes("router.project-osrm.org")) {
        expect(url).toContain("steps=true");
        expect((init?.headers as Record<string, string> | undefined)?.["user-agent"]).toBeTruthy();
        return new Response(
          JSON.stringify({
            routes: [
              {
                geometry: {
                  coordinates: [
                    [79.86, 6.93],
                    [80.0, 7.0],
                  ],
                },
                distance: 12000,
                duration: 900,
                legs: [{ steps: [{ maneuver: { type: "depart", location: [79.86, 6.93] }, distance: 0, duration: 0 }] }],
              },
            ],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await planRoute({ waypoints: [{ lat: 6.93, lon: 79.86 }, { lat: 7.0, lon: 80.0 }], curvy: 0.5 });
    expect(result.engine).toBe("osrm");
    expect(result.km).toBe(12);
    expect(result.maneuvers.length).toBeGreaterThan(0);
  });
});
