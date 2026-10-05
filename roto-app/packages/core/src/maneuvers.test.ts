import { describe, expect, it } from "vitest";
import { speakManeuver } from "./maneuvers";
import { ManeuverType } from "./types";
import type { Maneuver } from "./types";

function mk(overrides: Partial<Maneuver>): Maneuver {
  return {
    type: ManeuverType.Left,
    instruction: "Turn left onto Main Street",
    streets: ["Main Street"],
    lengthKm: 1,
    timeS: 60,
    beginIdx: 0,
    endIdx: 1,
    ...overrides,
  };
}

describe("speakManeuver", () => {
  it("prefers verbalPre for English when present", () => {
    const m = mk({ verbalPre: "In 300 meters, turn left onto Main Street." });
    expect(speakManeuver(m, "en", 300)).toBe("In 300 meters, turn left onto Main Street.");
  });

  it("builds an English sentence with street + distance when verbalPre is absent", () => {
    const m = mk({});
    const text = speakManeuver(m, "en", 300);
    expect(text).toContain("300 m");
    expect(text).toContain("Main Street");
    expect(text.toLowerCase()).toContain("turn left");
  });

  it("builds Sinhala and Tamil text distinct from English, including the street", () => {
    const m = mk({});
    const si = speakManeuver(m, "si", 300);
    const ta = speakManeuver(m, "ta", 300);
    expect(si).not.toBe(speakManeuver(m, "en", 300));
    expect(ta).not.toBe(speakManeuver(m, "en", 300));
    expect(si).toContain("Main Street");
    expect(ta).toContain("Main Street");
  });

  it("never uses verbalPre for si/ta (Valhalla has no si/ta narrative locale)", () => {
    const m = mk({ verbalPre: "In 300 meters, turn left onto Main Street." });
    expect(speakManeuver(m, "si", 300)).not.toContain("meters");
  });

  it("handles roundabout exit count", () => {
    const m = mk({ type: ManeuverType.RoundaboutExit, streets: [], exitCount: 2 });
    expect(speakManeuver(m, "en", 50)).toMatch(/second exit/i);
  });

  it("omits the distance clause for non-finite/zero distances", () => {
    const m = mk({});
    expect(speakManeuver(m, "en", 0)).not.toContain("In ");
  });
});
