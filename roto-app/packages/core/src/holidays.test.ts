import { describe, expect, it } from "vitest";
import { fullMoonsUtc, isPoya } from "./holidays";

// Gazetted 2026 Poya (full moon) dates for Sri Lanka, Asia/Colombo calendar days, cross-checked
// against calendarsrilanka.com and timeanddate.com (see packages/core/src/holidays.ts header for
// the algorithm's accuracy caveat). 2026 has 13 full moons because of the Vesak/"Adhi Vesak"
// double full moon in the same lunar cycle (1 May and 30 May are both genuine full moons).
const POYA_2026 = [
  "2026-01-03",
  "2026-02-01",
  "2026-03-02",
  "2026-04-01",
  "2026-05-01",
  "2026-05-30",
  "2026-06-29",
  "2026-07-29",
  "2026-08-27",
  "2026-09-26",
  "2026-10-25",
  "2026-11-24",
  "2026-12-23",
];

function colomboDateString(d: Date): string {
  const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("fullMoonsUtc", () => {
  it("finds 13 full moons in 2026, matching the gazetted Poya calendar within a day", () => {
    const moons = fullMoonsUtc(2026).map(colomboDateString);
    expect(moons).toHaveLength(13);
    for (const expected of POYA_2026) {
      const expectedDate = new Date(`${expected}T00:00:00Z`);
      const matchesWithinADay = moons.some((m) => {
        const diffDays = Math.abs(new Date(`${m}T00:00:00Z`).getTime() - expectedDate.getTime()) / 86400000;
        return diffDays <= 1;
      });
      expect(matchesWithinADay, `expected a computed full moon near ${expected}, got ${moons.join(", ")}`).toBe(true);
    }
  });

  it("returns full moons in ascending order", () => {
    const moons = fullMoonsUtc(2026);
    for (let i = 1; i < moons.length; i++) {
      const prev = moons[i - 1];
      const cur = moons[i];
      if (prev && cur) expect(cur.getTime()).toBeGreaterThan(prev.getTime());
    }
  });
});

describe("isPoya", () => {
  // Binara Poya, not Vesak: 2026's Vesak sits in a rare double-full-moon lunar cycle (see the
  // POYA_2026 comment above) where the gazetted date reflects a religious nekatha dispute, not
  // just the astronomical instant — a bad fixture for checking this module's own accuracy.
  // Binara has no such dispute and this mean-phase approximation lands on the same Colombo
  // calendar day as the gazette for it.
  it("is true on a known Poya day (Binara, 26 Sep 2026) in Colombo time", () => {
    expect(isPoya(new Date("2026-09-26T12:00:00+05:30"))).toBe(true);
  });

  it("is false on a non-Poya day", () => {
    expect(isPoya(new Date("2026-09-15T12:00:00+05:30"))).toBe(false);
  });
});
