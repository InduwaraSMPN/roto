import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { useEffect, useState } from "react";

export type Lang = "en" | "si" | "ta";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "si", label: "සිංහල" },
  { code: "ta", label: "தமிழ்" },
];
export const VOICE_LOCALE: Record<Lang, string> = { en: "en-LK", si: "si-LK", ta: "ta-LK" };

// ponytail: si/ta by non-native — get a native speaker to review before store release
const en = {
  turnLeft: "Turn left",
  turnRight: "Turn right",
  crash: "Crash detected. Alerting contacts.",
  rain: "Heavy rain ahead. Ride carefully.",
  ready: "Ready",
  startRide: "START RIDE",
  stop: "STOP",
  rec: "REC",
  signInPrompt: "Sign in on Home for sync + SOS contacts",
  sos: "SOS 119",
  offlineCmb: "Offline Colombo",
  loop: "Loop 60 km",
  routes: "Routes",
  import: "Import",
  hazard: "Hazard",
  shareLive: "Share live",
  join: "Join",
  code: "Code",
  syncQueued: "Sync queued rides",
  rideHud: "Ride HUD",
  tapExitHud: "tap anywhere to exit HUD",
  noRouteHud: "No route — LOOP, ROUTES or IMPORT",
  lastRide: "Last ride",
  maxLean: "max lean",
  saver: "Saver",
  saverOn: "Saver on",
  home: "Home",
  failedRoute: "Route failed — check connection",
  failedImport: "Could not read that file",
  failedJoin: "Wrong code — try again",
  hazardSaved: "Hazard reported — thanks",
  loginNeeded: "Sign in first",
  downloadingPack: "Downloading offline pack…",
  challenge: "Monthly challenge",
  challengeSub: "Most km ridden this month · target 500km",
  noRides: "No rides logged yet — be the first.",
  groupRides: "Group rides",
  rsvp: "RSVP",
  newRideName: "New ride name",
  add: "Add",
  privacyZones: "Privacy zones",
  privacySub: "Start/end inside a zone never leaves the phone. Set home on the Ride tab.",
  noZones: "No zones — tap HOME on the Ride tab.",
  delete: "Delete",
  attribution: "© OpenMapTiles © OpenStreetMap contributors",
  dismiss: "dismiss",
  rainLabel: "rain",
  windLabel: "wind",
};

export type Strings = typeof en;

const si: Strings = {
  turnLeft: "වමට හැරෙන්න",
  turnRight: "දකුණට හැරෙන්න",
  crash: "අනතුරක් අනාවරණය විය. සම්බන්ධතා දැනුවත් කරයි.",
  rain: "තද වැස්සක් ඉදිරියෙන්. ප්‍රවේශමෙන් ධාවනය කරන්න.",
  ready: "සූදානම්",
  startRide: "ගමන අරඹන්න",
  stop: "නවත්වන්න",
  rec: "REC",
  signInPrompt: "සමමුහුර්තය සහ SOS සඳහා Home හි ලොග් වන්න",
  sos: "SOS 119",
  offlineCmb: "Offline Colombo",
  loop: "Loop 60 km",
  routes: "මාර්ග",
  import: "Import",
  hazard: "අනතුර",
  shareLive: "LIVE බෙදාගන්න",
  join: "එකතු වන්න",
  code: "Code",
  syncQueued: "රැඳුණු ගමන් යවන්න",
  rideHud: "Ride HUD",
  tapExitHud: "ඉවත් වීමට තට්ටු කරන්න",
  noRouteHud: "මාර්ගයක් නැත — LOOP, ROUTES හෝ IMPORT",
  lastRide: "අවසන් ගමන",
  maxLean: "උපරිම ඇලය",
  saver: "Saver",
  saverOn: "Saver on",
  home: "Home",
  failedRoute: "මාර්ගය අසාර්ථකයි — සම්බන්ධතාව බලන්න",
  failedImport: "ගොනුව කියවිය නොහැක",
  failedJoin: "වැරදි කේතය — නැවත උත්සාහ කරන්න",
  hazardSaved: "අනතුර වාර්තා විය — ස්තූතියි",
  loginNeeded: "පළමුව ලොග් වන්න",
  downloadingPack: "Offline pack බාගනිමින්…",
  challenge: "මාසික අභියෝගය",
  challengeSub: "මේ මාසයේ වැඩිම km · ඉලක්කය 500km",
  noRides: "තවම ගමන් නැත — පළමුවැන්නා වන්න.",
  groupRides: "කණ්ඩායම් ගමන්",
  rsvp: "RSVP",
  newRideName: "අලුත් ගමනේ නම",
  add: "Add",
  privacyZones: "පෞද්ගලික කලාප",
  privacySub: "කලාපයක් තුළ ආරම්භය/අවසානය දුරකථනයෙන් පිටවන්නේ නැත.",
  noZones: "කලාප නැත — Ride tab එකේ HOME ඔබන්න.",
  delete: "මකන්න",
  attribution: "© OpenMapTiles © OpenStreetMap දායකයින්",
  dismiss: "ඉවත් කරන්න",
  rainLabel: "වැස්ස",
  windLabel: "සුළඟ",
};

const ta: Strings = {
  turnLeft: "இடதுபுறம் திரும்பவும்",
  turnRight: "வலதுபுறம் திரும்பவும்",
  crash: "விபத்து கண்டறியப்பட்டது. தொடர்புகளுக்கு அறிவிக்கப்படுகிறது.",
  rain: "முன்னால் கனமழை. கவனமாக ஓட்டவும்.",
  ready: "தயார்",
  startRide: "பயணத்தைத் தொடங்கு",
  stop: "நிறுத்து",
  rec: "REC",
  signInPrompt: "ஒத்திசைவு + SOS தொடர்புகளுக்கு Home-இல் உள்நுழைக",
  sos: "SOS 119",
  offlineCmb: "Offline Colombo",
  loop: "Loop 60 km",
  routes: "வழிகள்",
  import: "Import",
  hazard: "ஆபத்து",
  shareLive: "LIVE பகிர்",
  join: "சேர்",
  code: "Code",
  syncQueued: "காத்திருக்கும் பயணங்களை அனுப்பு",
  rideHud: "Ride HUD",
  tapExitHud: "வெளியேற தட்டவும்",
  noRouteHud: "வழி இல்லை — LOOP, ROUTES அல்லது IMPORT",
  lastRide: "கடைசி பயணம்",
  maxLean: "அதிக சாய்வு",
  saver: "Saver",
  saverOn: "Saver on",
  home: "Home",
  failedRoute: "வழி தோல்வி — இணைப்பைப் பார்",
  failedImport: "கோப்பைப் படிக்க முடியவில்லை",
  failedJoin: "தவறான குறியீடு — மீண்டும் முயல்",
  hazardSaved: "ஆபத்து பதிவானது — நன்றி",
  loginNeeded: "முதலில் உள்நுழைக",
  downloadingPack: "Offline pack பதிவிறக்குகிறது…",
  challenge: "மாதாந்திர சவால்",
  challengeSub: "இந்த மாதம் அதிக km · இலக்கு 500km",
  noRides: "இன்னும் பயணங்கள் இல்லை — முதலாவதாக இரு.",
  groupRides: "குழு பயணங்கள்",
  rsvp: "RSVP",
  newRideName: "புதிய பயணப் பெயர்",
  add: "Add",
  privacyZones: "தனியுரிமை மண்டலங்கள்",
  privacySub: "மண்டலத்திற்குள் தொடக்கம்/முடிவு தொலைபேசியை விட்டு வெளியேறாது.",
  noZones: "மண்டலங்கள் இல்லை — Ride tab-இல் HOME அழுத்தவும்.",
  delete: "நீக்கு",
  attribution: "© OpenMapTiles © OpenStreetMap பங்களிப்பாளர்கள்",
  dismiss: "நீக்கு",
  rainLabel: "மழை",
  windLabel: "காற்று",
};

export const STR: Record<Lang, Strings> = { en, si, ta };

export const speak = (lang: Lang, key: keyof Strings) =>
  Speech.speak(STR[lang][key], { language: VOICE_LOCALE[lang] });

export function useLang() {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    SecureStore.getItemAsync("roto-lang").then((v) => {
      if (v === "si" || v === "ta") setLangState(v);
    }).catch(() => undefined);
  }, []);
  const setLang = async (l: Lang) => {
    setLangState(l);
    await SecureStore.setItemAsync("roto-lang", l).catch(() => undefined);
  };
  return { lang, setLang, t: STR[lang] };
}
