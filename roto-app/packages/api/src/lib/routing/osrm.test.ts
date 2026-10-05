import { describe, expect, it } from "vitest";
import { ManeuverType } from "@roto-app/core/types";
import { mapType } from "./osrm";

const at = [0, 0] as [number, number];

describe("mapType (OSRM -> core ManeuverType, B14)", () => {
  it("maps depart/arrive", () => {
    expect(mapType({ type: "depart", location: at })).toBe(ManeuverType.Start);
    expect(mapType({ type: "arrive", location: at })).toBe(ManeuverType.Destination);
  });

  it("maps turn + modifier to the matching left/right variant", () => {
    expect(mapType({ type: "turn", modifier: "left", location: at })).toBe(ManeuverType.Left);
    expect(mapType({ type: "turn", modifier: "right", location: at })).toBe(ManeuverType.Right);
    expect(mapType({ type: "turn", modifier: "sharp left", location: at })).toBe(ManeuverType.SharpLeft);
    expect(mapType({ type: "turn", modifier: "sharp right", location: at })).toBe(ManeuverType.SharpRight);
    expect(mapType({ type: "turn", modifier: "slight left", location: at })).toBe(ManeuverType.SlightLeft);
    expect(mapType({ type: "turn", modifier: "slight right", location: at })).toBe(ManeuverType.SlightRight);
    expect(mapType({ type: "turn", modifier: "uturn", location: at })).toBe(ManeuverType.UturnLeft);
  });

  it("maps roundabout enter/exit", () => {
    expect(mapType({ type: "roundabout", location: at })).toBe(ManeuverType.RoundaboutEnter);
    expect(mapType({ type: "exit roundabout", location: at })).toBe(ManeuverType.RoundaboutExit);
  });

  it("maps ramps by modifier side", () => {
    expect(mapType({ type: "on ramp", modifier: "left", location: at })).toBe(ManeuverType.RampLeft);
    expect(mapType({ type: "on ramp", modifier: "right", location: at })).toBe(ManeuverType.RampRight);
  });

  it("falls back to Continue for unrecognized types", () => {
    expect(mapType({ type: "notification", location: at })).toBe(ManeuverType.Continue);
  });
});
