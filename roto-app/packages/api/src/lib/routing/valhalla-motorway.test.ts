import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planValhalla } from "./valhalla";
import type { PlanOptions } from "./types";

// Regression coverage for the post-check an infra agent asked for: this LK Valhalla extract does
// NOT tag the Southern Expressway `motorcycle=no` (confirmed via /locate near Kottawa), so
// `use_highways: 0` alone is only a preference. planValhalla must verify the real route via
// /trace_attributes and replan around any motorway edge rather than silently returning one.

const OPTS: PlanOptions = { waypoints: [{ lat: 6.8393, lon: 79.9629 }, { lat: 6.0367, lon: 80.217 }], curvy: 0.5 };

// "????" is a valid polyline6 encoding of two (0, 0) points (each "?" is a zero delta) — enough
// points that findMotorwaySegments's own `coords.length < 2` guard doesn't short-circuit it
// before the /trace_attributes call it's meant to test. The exact coordinates don't matter here,
// only whether planValhalla accepts, retries, or rejects based on `edges`.
function routeResponse() {
  return {
    trip: {
      legs: [{ shape: "????", maneuvers: [] }],
      summary: { length: 100, time: 6000 },
    },
  };
}

function traceAttributesResponse(hasMotorway: boolean) {
  return {
    shape: "????",
    edges: hasMotorway ? [{ road_class: "motorway", begin_shape_index: 0, end_shape_index: 1 }] : [],
  };
}

describe("planValhalla motorway post-check", () => {
  beforeEach(() => {
    process.env.VALHALLA_URL = "http://localhost:8002/route";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VALHALLA_URL;
  });

  it("returns the route unchanged when no motorway edge is found", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/route")) return new Response(JSON.stringify(routeResponse()), { status: 200 });
      if (url.endsWith("/trace_attributes")) {
        return new Response(JSON.stringify(traceAttributesResponse(false)), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await planValhalla(OPTS);
    expect(result.engine).toBe("valhalla");
    // exactly one /route call and one /trace_attributes check — no retry needed.
    const routeCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/route"));
    expect(routeCalls).toHaveLength(1);
  });

  it("replans once with exclude_polygons when a motorway edge is found, and accepts a clean retry", async () => {
    let routeCallCount = 0;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/route")) {
        routeCallCount++;
        if (routeCallCount === 1) {
          const body = JSON.parse(String(init?.body));
          expect(body.exclude_polygons).toBeUndefined();
        } else {
          const body = JSON.parse(String(init?.body));
          expect(body.exclude_polygons).toBeDefined();
        }
        return new Response(JSON.stringify(routeResponse()), { status: 200 });
      }
      if (url.endsWith("/trace_attributes")) {
        // first check (on the original route): motorway found. Second check (on the retry): clean.
        const hasMotorway = routeCallCount === 1;
        return new Response(JSON.stringify(traceAttributesResponse(hasMotorway)), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await planValhalla(OPTS);
    expect(result.engine).toBe("valhalla");
    expect(routeCallCount).toBe(2); // original + one exclude_polygons retry
  });

  it("throws (so the engine chain falls back to BRouter) when the retry still has a motorway edge", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/route")) return new Response(JSON.stringify(routeResponse()), { status: 200 });
      if (url.endsWith("/trace_attributes")) {
        return new Response(JSON.stringify(traceAttributesResponse(true)), { status: 200 }); // always flagged
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(planValhalla(OPTS)).rejects.toThrow(/motorway/);
  });
});
