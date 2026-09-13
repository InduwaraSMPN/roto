import * as Speech from "expo-speech";

export type Lang = "en" | "si" | "ta";
export const VOICE_LOCALE: Record<Lang, string> = { en: "en-LK", si: "si-LK", ta: "ta-LK" };

export const STR: Record<Lang, { turnLeft: string; turnRight: string; crash: string; rain: string }> = {
  en: {
    turnLeft: "Turn left",
    turnRight: "Turn right",
    crash: "Crash detected. Alerting contacts.",
    rain: "Heavy rain ahead. Ride carefully.",
  },
  si: {
    turnLeft: "වමට හැරෙන්න",
    turnRight: "දකුණට හැරෙන්න",
    crash: "අනතුරක් අනාවරණය විය. සම්බන්ධතා දැනුවත් කරයි.",
    rain: "තද වැස්සක් ඉදිරියෙන්. ප්‍රවේශමෙන් ධාවනය කරන්න.",
  },
  ta: {
    turnLeft: "இடதுபுறம் திரும்பவும்",
    turnRight: "வலதுபுறம் திரும்பவும்",
    crash: "விபத்து கண்டறியப்பட்டது. தொடர்புகளுக்கு அறிவிக்கப்படுகிறது.",
    rain: "முன்னால் கனமழை. கவனமாக ஓட்டவும்.",
  },
};

export const speak = (lang: Lang, key: keyof (typeof STR)["en"]) =>
  Speech.speak(STR[lang][key], { language: VOICE_LOCALE[lang] });
