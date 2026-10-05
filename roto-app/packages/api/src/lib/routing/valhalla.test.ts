import { afterEach, describe, expect, it } from "vitest";
import { motorcycleCostingOptions, toLocations, valhallaActionUrl, valhallaBaseUrl } from "./valhalla";
import type { PlanOptions } from "./types";

function opts(overrides: Partial<PlanOptions> = {}): PlanOptions {
  return { waypoints: [{ lat: 6.93, lon: 79.86 }, { lat: 7.29, lon: 80.63 }], curvy: 0.5, ...overrides };
}

describe("motorcycleCostingOptions (B1 fix)", () => {
  it("always sets use_highways: 0 (expressway ban preference)", () => {
    expect(motorcycleCostingOptions(opts({ curvy: 0 })).use_highways).toBe(0);
    expect(motorcycleCostingOptions(opts({ curvy: 1 })).use_highways).toBe(0);
  });

  it("never sends the old motor_scooter-only use_hills/use_primary keys", () => {
    const o = motorcycleCostingOptions(opts());
    expect(o).not.toHaveProperty("use_hills");
    expect(o).not.toHaveProperty("use_primary");
  });

  it("scales use_trails with curvy, and caps it lower when avoiding unpaved", () => {
    const low = motorcycleCostingOptions(opts({ curvy: 0.2 })).use_trails;
    const high = motorcycleCostingOptions(opts({ curvy: 0.9 })).use_trails;
    expect(high).toBeGreaterThan(low);

    const capped = motorcycleCostingOptions(opts({ curvy: 1, avoid: { unpaved: true } })).use_trails;
    const uncapped = motorcycleCostingOptions(opts({ curvy: 1, avoid: { unpaved: false } })).use_trails;
    expect(capped).toBeLessThan(uncapped);
  });

  it("zeroes tolls/ferry when avoided, else leaves them at the neutral default", () => {
    const avoided = motorcycleCostingOptions(opts({ avoid: { tolls: true, ferries: true } }));
    expect(avoided.use_tolls).toBe(0);
    expect(avoided.use_ferry).toBe(0);
    const allowed = motorcycleCostingOptions(opts({ avoid: {} }));
    expect(allowed.use_tolls).toBeGreaterThan(0);
    expect(allowed.use_ferry).toBeGreaterThan(0);
  });

  it("enables disable_hierarchy_pruning only at the extreme-curvy end", () => {
    expect(motorcycleCostingOptions(opts({ curvy: 0.5 }))).not.toHaveProperty("disable_hierarchy_pruning");
    expect(motorcycleCostingOptions(opts({ curvy: 1 })).disable_hierarchy_pruning).toBe(true);
  });
});

describe("toLocations (LK expressway ban)", () => {
  it("sets search_filter.max_road_class: trunk on every location", () => {
    for (const loc of toLocations(opts())) {
      expect(loc.search_filter).toEqual({ max_road_class: "trunk" });
    }
  });

  it("puts heading + heading_tolerance only on the first location, only when heading is set", () => {
    const withHeading = toLocations(opts({ heading: 45 }));
    expect(withHeading[0]).toMatchObject({ heading: 45, heading_tolerance: 45 });
    expect(withHeading[1]).not.toHaveProperty("heading");

    const withoutHeading = toLocations(opts());
    expect(withoutHeading[0]).not.toHaveProperty("heading");
  });
});

describe("valhallaBaseUrl / valhallaActionUrl", () => {
  afterEach(() => {
    delete process.env.VALHALLA_URL;
  });

  it("is undefined when VALHALLA_URL is unset", () => {
    expect(valhallaBaseUrl()).toBeUndefined();
    expect(valhallaActionUrl("trace_attributes")).toBeUndefined();
  });

  it("strips a trailing /route to find sibling actions", () => {
    process.env.VALHALLA_URL = "http://localhost:8002/route";
    expect(valhallaBaseUrl()).toBe("http://localhost:8002");
    expect(valhallaActionUrl("trace_attributes")).toBe("http://localhost:8002/trace_attributes");
    expect(valhallaActionUrl("height")).toBe("http://localhost:8002/height");
  });

  it("works when VALHALLA_URL is already the bare host", () => {
    process.env.VALHALLA_URL = "http://localhost:8002";
    expect(valhallaActionUrl("route")).toBe("http://localhost:8002/route");
  });
});
