// Offline full-moon (Poya) calculation, Meeus "Astronomical Algorithms" ch. 49 mean phase +
// the largest periodic correction terms. This is the offline cross-check for the server's
// Calendarific-sourced holiday table (plan §5.2) — Calendarific is the primary source; this
// module lets the native app compute Poya locally with zero network calls, and lets the server
// sanity-check the fetched dates. It is not ephemeris-grade (it skips ΔT and the smallest lunar
// terms) — verified against the gazetted 2026 Sri Lanka Poya calendar it lands on the correct
// Colombo calendar day for most months, but can be off by one day when the true instant falls
// close to local midnight (see holidays.test.ts). Treat it as a cross-check, not the source of
// truth — that's Calendarific, fetched server-side.
const RAD = Math.PI / 180;
const sinDeg = (deg: number) => Math.sin(deg * RAD);

function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Julian Day (UTC) of the full moon nearest to `k` synodic months after 2000-01-06 (k=0 is a new moon). */
function fullMoonJde(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  const JDE0 = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = normalizeDeg(2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3);
  const Mp = normalizeDeg(201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4);
  const F = normalizeDeg(160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4);
  const omega = normalizeDeg(124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3);

  // Largest terms of the full-moon periodic correction (Meeus table 49.1), in days.
  let corr = 0;
  corr += -0.4072 * sinDeg(Mp);
  corr += 0.17241 * E * sinDeg(M);
  corr += 0.01608 * sinDeg(2 * Mp);
  corr += 0.01039 * sinDeg(2 * F);
  corr += 0.00739 * E * sinDeg(Mp - M);
  corr += -0.00514 * E * sinDeg(Mp + M);
  corr += 0.00208 * E * E * sinDeg(2 * M);
  corr += -0.00111 * sinDeg(Mp - 2 * F);
  corr += -0.00057 * sinDeg(Mp + 2 * F);
  corr += 0.00056 * E * sinDeg(2 * Mp + M);
  corr += -0.00042 * sinDeg(3 * Mp);
  corr += 0.00042 * E * sinDeg(M + 2 * F);
  corr += 0.00038 * E * sinDeg(M - 2 * F);
  corr += -0.00024 * E * sinDeg(2 * Mp - M);
  corr += -0.00017 * sinDeg(omega);
  corr += -0.00007 * sinDeg(Mp + 2 * M);
  corr += 0.00004 * sinDeg(2 * Mp - 2 * F);
  corr += 0.00004 * sinDeg(3 * M);

  return JDE0 + corr;
}

function jdToUtcDate(jd: number): Date {
  // Julian Day -> Gregorian calendar (Meeus ch. 7), then to a UTC Date.
  const jdAdj = jd + 0.5;
  const Z = Math.floor(jdAdj);
  const F = jdAdj - Z;
  let A = Z;
  if (Z >= 2299161) {
    const alpha = Math.floor((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + F;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const dayFloor = Math.floor(day);
  const hoursFraction = (day - dayFloor) * 24;
  const hours = Math.floor(hoursFraction);
  const minutesFraction = (hoursFraction - hours) * 60;
  const minutes = Math.floor(minutesFraction);
  const seconds = Math.round((minutesFraction - minutes) * 60);
  return new Date(Date.UTC(year, month - 1, dayFloor, hours, minutes, seconds));
}

/** All full moons (UTC instants) in a given Gregorian year. */
export function fullMoonsUtc(year: number): Date[] {
  // k is roughly synodic months since 2000-01-06; +0.5 selects full (vs. new) moons.
  const kStart = Math.floor((year - 2000) * 12.3685) - 2;
  const out: Date[] = [];
  for (let i = 0; i < 16; i++) {
    const k = kStart + i + 0.5;
    const date = jdToUtcDate(fullMoonJde(k));
    if (date.getUTCFullYear() === year) out.push(date);
  }
  out.sort((a, b) => a.getTime() - b.getTime());
  return out;
}

/**
 * Whether `date` falls on a Poya (full moon) day in the Asia/Colombo calendar (UTC+5:30, no DST).
 * Poya is a calendar-day observance, so this compares dates after shifting to Colombo local time.
 */
export function isPoya(date: Date): boolean {
  const colomboOffsetMs = 5.5 * 60 * 60 * 1000;
  const localDay = (d: Date) => {
    const shifted = new Date(d.getTime() + colomboOffsetMs);
    return `${shifted.getUTCFullYear()}-${shifted.getUTCMonth()}-${shifted.getUTCDate()}`;
  };
  const targetDay = localDay(date);
  const year = new Date(date.getTime() + colomboOffsetMs).getUTCFullYear();
  // A full moon near year boundaries can land on the neighbouring year in UTC vs Colombo time,
  // so check the surrounding years too.
  const moons = [...fullMoonsUtc(year - 1), ...fullMoonsUtc(year), ...fullMoonsUtc(year + 1)];
  return moons.some((m) => localDay(m) === targetDay);
}
