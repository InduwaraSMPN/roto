import { describe, expect, it } from "vitest";
import { parseGoogleMapsUrl } from "./google-url";

describe("parseGoogleMapsUrl", () => {
  it("parses the ?api=1&origin&destination&waypoints form", () => {
    const out = parseGoogleMapsUrl(
      "https://www.google.com/maps/dir/?api=1&origin=6.9271,79.8612&destination=7.2906,80.6337&waypoints=6.95,79.9|7.0,80.0&travelmode=driving",
    );
    expect(out.waypoints).toHaveLength(4);
    expect(out.waypoints[0]).toEqual({ lat: 6.9271, lon: 79.8612 });
    expect(out.waypoints[3]).toEqual({ lat: 7.2906, lon: 80.6337 });
  });

  it("parses the /maps/dir/a/b/.../@lat,lon,zoom path form", () => {
    const out = parseGoogleMapsUrl("https://www.google.com/maps/dir/6.9271,79.8612/7.2906,80.6337/@7.1,80.2,10z");
    expect(out.waypoints).toEqual([
      { lat: 6.9271, lon: 79.8612 },
      { lat: 7.2906, lon: 80.6337 },
    ]);
  });

  it("returns named stops as {name} when a leg isn't a coordinate pair", () => {
    const out = parseGoogleMapsUrl("https://www.google.com/maps/dir/Colombo/Kandy/@7.1,80.2,10z");
    expect(out.waypoints).toEqual([{ name: "Colombo" }, { name: "Kandy" }]);
  });

  it("throws on an unrecognized URL shape", () => {
    expect(() => parseGoogleMapsUrl("https://www.google.com/maps/place/Colombo")).toThrow(/Unrecognized/);
  });
});
