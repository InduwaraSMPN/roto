import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { importRouteFile } from "./index";

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Coast road</name>
      <LineString>
        <coordinates>79.86,6.93,0 80.0,7.0,0 80.63,7.29,0</coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <name>Fuel stop</name>
      <Point><coordinates>79.9,6.95,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Ride</name><trkseg>
    <trkpt lat="6.93" lon="79.86"/>
    <trkpt lat="7.0" lon="80.0"/>
  </trkseg></trk>
</gpx>`;

const ITN = ["7986120|692710|Colombo|4", "8063370|729060|Kandy|4", "not a valid line"].join("\r\n");

describe("importRouteFile", () => {
  it("imports a .gpx track", async () => {
    const out = await importRouteFile("ride.gpx", new TextEncoder().encode(GPX));
    expect(out.tracks).toHaveLength(1);
    expect(out.tracks[0]).toHaveLength(2);
  });

  it("imports a .kml LineString as a track and Point as a waypoint", async () => {
    const out = await importRouteFile("route.kml", new TextEncoder().encode(KML));
    expect(out.tracks).toHaveLength(1);
    expect(out.tracks[0]).toHaveLength(3);
    expect(out.waypoints).toHaveLength(1);
    expect(out.waypoints[0]?.name).toBe("Fuel stop");
  });

  it("imports a .kmz by unzipping the first .kml inside", async () => {
    const zip = zipSync({ "doc.kml": strToU8(KML) });
    const out = await importRouteFile("route.kmz", zip);
    expect(out.tracks).toHaveLength(1);
    expect(out.tracks[0]).toHaveLength(3);
  });

  it("rejects a .kmz with no .kml entry", async () => {
    const zip = zipSync({ "readme.txt": strToU8("hello") });
    await expect(importRouteFile("route.kmz", zip)).rejects.toThrow(/kml/i);
  });

  it("parses a .itn file, skipping malformed lines", async () => {
    const out = await importRouteFile("trip.itn", new TextEncoder().encode(ITN));
    expect(out.routes).toHaveLength(1);
    expect(out.routes[0]).toHaveLength(2);
    expect(out.routes[0]?.[0]?.[0]).toBeCloseTo(79.8612, 4);
    expect(out.routes[0]?.[0]?.[1]).toBeCloseTo(6.9271, 4);
    expect(out.waypoints.map((w) => w.name)).toEqual(["Colombo", "Kandy"]);
  });

  it("gives a clear error for .gdb", async () => {
    await expect(importRouteFile("trip.gdb", new Uint8Array())).rejects.toThrow(/BaseCamp/);
  });

  it("rejects unknown extensions", async () => {
    await expect(importRouteFile("trip.xyz", new Uint8Array())).rejects.toThrow(/Unsupported/);
  });
});
