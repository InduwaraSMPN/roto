// Builds spoken/HUD turn instructions from a core Maneuver, in en/si/ta.
// Valhalla has no Sinhala or Tamil narrative locale (confirmed against valhalla/locales, plan
// §1.2), so si/ta voice text is always built here from `type` + street names + distance.
// English prefers Valhalla's own `verbalPre` when present, since it already reads naturally
// ("In 300 meters, turn left onto Main Street") and includes distance/street phrasing tuned by
// Valhalla itself.
import { ManeuverType } from "./types";
import type { Lang, Maneuver } from "./types";

type TurnKey =
  | "start"
  | "destination"
  | "continue"
  | "slightRight"
  | "right"
  | "sharpRight"
  | "uturn"
  | "sharpLeft"
  | "left"
  | "slightLeft"
  | "ramp"
  | "exit"
  | "keepStraight"
  | "keepRight"
  | "keepLeft"
  | "merge"
  | "roundaboutEnter"
  | "roundaboutExit"
  | "ferry"
  | "generic";

function turnKeyForType(type: number): TurnKey {
  switch (type) {
    case ManeuverType.Start:
    case ManeuverType.StartRight:
    case ManeuverType.StartLeft:
      return "start";
    case ManeuverType.Destination:
    case ManeuverType.DestinationRight:
    case ManeuverType.DestinationLeft:
      return "destination";
    case ManeuverType.Continue:
    case ManeuverType.Becomes:
    case ManeuverType.None:
      return "continue";
    case ManeuverType.SlightRight:
      return "slightRight";
    case ManeuverType.Right:
      return "right";
    case ManeuverType.SharpRight:
      return "sharpRight";
    case ManeuverType.UturnRight:
    case ManeuverType.UturnLeft:
      return "uturn";
    case ManeuverType.SharpLeft:
      return "sharpLeft";
    case ManeuverType.Left:
      return "left";
    case ManeuverType.SlightLeft:
      return "slightLeft";
    case ManeuverType.RampStraight:
    case ManeuverType.RampRight:
    case ManeuverType.RampLeft:
      return "ramp";
    case ManeuverType.ExitRight:
    case ManeuverType.ExitLeft:
      return "exit";
    case ManeuverType.StayStraight:
      return "keepStraight";
    case ManeuverType.StayRight:
      return "keepRight";
    case ManeuverType.StayLeft:
      return "keepLeft";
    case ManeuverType.Merge:
    case ManeuverType.MergeRight:
    case ManeuverType.MergeLeft:
      return "merge";
    case ManeuverType.RoundaboutEnter:
      return "roundaboutEnter";
    case ManeuverType.RoundaboutExit:
      return "roundaboutExit";
    case ManeuverType.FerryEnter:
    case ManeuverType.FerryExit:
      return "ferry";
    default:
      return "generic";
  }
}

const EN_ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
const enOrdinal = (n: number) => EN_ORDINALS[n - 1] ?? `${n}th`;

function withStreet(base: string, streets: string[]): string {
  const name = streets[0];
  return name ? `${base} onto ${name}` : base;
}

const EN: Record<TurnKey, (streets: string[], exitCount?: number) => string> = {
  start: (s) => (s[0] ? `Head toward ${s[0]}` : "Head out"),
  destination: () => "You have arrived",
  continue: (s) => (s[0] ? `Continue on ${s[0]}` : "Continue straight"),
  slightRight: (s) => withStreet("Bear right", s),
  right: (s) => withStreet("Turn right", s),
  sharpRight: (s) => withStreet("Make a sharp right", s),
  uturn: () => "Make a U-turn",
  sharpLeft: (s) => withStreet("Make a sharp left", s),
  left: (s) => withStreet("Turn left", s),
  slightLeft: (s) => withStreet("Bear left", s),
  ramp: () => "Take the ramp",
  exit: () => "Take the exit",
  keepStraight: () => "Keep straight",
  keepRight: () => "Keep right",
  keepLeft: () => "Keep left",
  merge: (s) => withStreet("Merge", s),
  roundaboutEnter: () => "Enter the roundabout",
  roundaboutExit: (_s, exitCount) => (exitCount ? `Take the ${enOrdinal(exitCount)} exit` : "Exit the roundabout"),
  ferry: () => "Take the ferry",
  generic: (s) => withStreet("Continue", s),
};

// ponytail: si/ta maneuver phrasing below is a non-native best effort — same review gate as
// apps/native/lib/i18n.ts ("get a native speaker to review before store release"). It extends
// that file's existing turnLeft/turnRight wording to the rest of the Valhalla maneuver set.
function withStreetSi(base: string, streets: string[]): string {
  const name = streets[0];
  return name ? `${name} හරහා ${base}` : base;
}

const SI: Record<TurnKey, (streets: string[], exitCount?: number) => string> = {
  start: (s) => (s[0] ? `${s[0]} දෙසට ගමන් අරඹන්න` : "ගමන අරඹන්න"),
  destination: () => "ඔබ ගමනාන්තයට පැමිණ ඇත",
  continue: (s) => (s[0] ? `${s[0]} දිගේ ඉදිරියට යන්න` : "කෙළින්ම ඉදිරියට යන්න"),
  slightRight: (s) => withStreetSi("තරමක් දකුණට හැරෙන්න", s),
  right: (s) => withStreetSi("දකුණට හැරෙන්න", s),
  sharpRight: (s) => withStreetSi("තියුනු ලෙස දකුණට හැරෙන්න", s),
  uturn: () => "යූ-ටර්න් එකක් ගන්න",
  sharpLeft: (s) => withStreetSi("තියුනු ලෙස වමට හැරෙන්න", s),
  left: (s) => withStreetSi("වමට හැරෙන්න", s),
  slightLeft: (s) => withStreetSi("තරමක් වමට හැරෙන්න", s),
  ramp: () => "රැම්පුවට යන්න",
  exit: () => "පිටවීමට යන්න",
  keepStraight: () => "කෙළින්ම දිගටම යන්න",
  keepRight: () => "දකුණු පසින් දිගටම යන්න",
  keepLeft: () => "වම් පසින් දිගටම යන්න",
  merge: (s) => (s[0] ? `${s[0]} වෙත එකතු වන්න` : "ප්‍රධාන මාර්ගයට එකතු වන්න"),
  roundaboutEnter: () => "රවුම් සන්ධියට ඇතුළු වන්න",
  roundaboutExit: (_s, exitCount) => (exitCount ? `${exitCount} වන පිටවීම භාවිත කරන්න` : "රවුම් සන්ධියෙන් පිටවන්න"),
  ferry: () => "ෆෙරි එකට යන්න",
  generic: (s) => (s[0] ? `${s[0]} දිගේ ඉදිරියට යන්න` : "ඉදිරියට යන්න"),
};

function withStreetTa(base: string, streets: string[]): string {
  const name = streets[0];
  return name ? `${name} வழியாக ${base}` : base;
}

const TA: Record<TurnKey, (streets: string[], exitCount?: number) => string> = {
  start: (s) => (s[0] ? `${s[0]} நோக்கி பயணத்தைத் தொடங்கவும்` : "பயணத்தைத் தொடங்கவும்"),
  destination: () => "நீங்கள் இலக்கை அடைந்துவிட்டீர்கள்",
  continue: (s) => (s[0] ? `${s[0]} வழியாக தொடரவும்` : "நேராகத் தொடரவும்"),
  slightRight: (s) => withStreetTa("சற்று வலதுபுறம் திரும்பவும்", s),
  right: (s) => withStreetTa("வலதுபுறம் திரும்பவும்", s),
  sharpRight: (s) => withStreetTa("கூர்மையாக வலதுபுறம் திரும்பவும்", s),
  uturn: () => "யூ-டர்ன் எடுக்கவும்",
  sharpLeft: (s) => withStreetTa("கூர்மையாக இடதுபுறம் திரும்பவும்", s),
  left: (s) => withStreetTa("இடதுபுறம் திரும்பவும்", s),
  slightLeft: (s) => withStreetTa("சற்று இடதுபுறம் திரும்பவும்", s),
  ramp: () => "ராம்பிற்குச் செல்லவும்",
  exit: () => "வெளியேறும் வழியில் செல்லவும்",
  keepStraight: () => "நேராகத் தொடரவும்",
  keepRight: () => "வலதுபுறம் தொடரவும்",
  keepLeft: () => "இடதுபுறம் தொடரவும்",
  merge: (s) => (s[0] ? `${s[0]} இல் இணையவும்` : "பிரதான வழியில் இணையவும்"),
  roundaboutEnter: () => "வட்டவழிக்குள் நுழையவும்",
  roundaboutExit: (_s, exitCount) => (exitCount ? `${exitCount} ஆவது வெளியேற்றத்தைப் பயன்படுத்தவும்` : "வட்டவழியிலிருந்து வெளியேறவும்"),
  ferry: () => "படகில் ஏறவும்",
  generic: (s) => (s[0] ? `${s[0]} வழியாகத் தொடரவும்` : "தொடரவும்"),
};

const TEMPLATES: Record<Lang, Record<TurnKey, (streets: string[], exitCount?: number) => string>> = { en: EN, si: SI, ta: TA };

/** Rounds a distance for speech: nearest 10m under 100m, nearest 50m under 1km, else 1 decimal km (or whole km >= 10km). */
function roundDistance(distanceM: number): { value: number; unit: "m" | "km" } {
  if (distanceM < 1000) {
    const step = distanceM < 100 ? 10 : 50;
    return { value: Math.round(distanceM / step) * step, unit: "m" };
  }
  const km = distanceM / 1000;
  return { value: km >= 10 ? Math.round(km) : Math.round(km * 10) / 10, unit: "km" };
}

function distancePhrase(distanceM: number, lang: Lang): string | null {
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null;
  const { value, unit } = roundDistance(distanceM);
  if (lang === "en") return unit === "m" ? `${value} m` : `${value} km`;
  if (lang === "si") return unit === "m" ? `මීටර් ${value}කින්` : `කිලෝමීටර් ${value}කින්`;
  return unit === "m" ? `${value} மீட்டரில்` : `${value} கி.மீ-இல்`;
}

/** Builds a spoken instruction for a maneuver, e.g. "In 300 m, turn left onto Main Street". */
export function speakManeuver(m: Maneuver, lang: Lang, distanceM: number): string {
  if (lang === "en" && m.verbalPre) return m.verbalPre;

  const turn = TEMPLATES[lang][turnKeyForType(m.type)](m.streets, m.exitCount);
  const dist = distancePhrase(distanceM, lang);
  if (!dist) return turn;

  if (lang === "en") return `In ${dist}, ${turn.charAt(0).toLowerCase()}${turn.slice(1)}`;
  // si/ta lead with the distance clause, then the instruction (natural word order for both).
  return `${dist}, ${turn}`;
}
