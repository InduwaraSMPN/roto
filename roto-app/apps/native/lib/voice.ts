// Single speech queue (plan §3.5 "lib/voice.ts"). Replaces the old apps/native/lib/i18n.ts
// `speak()`, which called `Speech.speak()` directly from every call site with no ordering — two
// almost-simultaneous calls (e.g. a rain warning right as a turn is announced) would overlap or
// cut each other off. Also detects whether the device actually has a Sinhala/Tamil voice
// installed (plan §1.2: Android ships si-LK/ta-IN as separately downloaded voices) and falls
// back to English instead of silently mispronouncing or throwing.
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";

import { STR, VOICE_LOCALE, type AppStrings, type Lang } from "./i18n";

type QueueItem = { text: string; lang: Lang };

let queue: QueueItem[] = [];
let speaking = false;

let voicesCache: Speech.Voice[] | null = null;
let voicesPromise: Promise<Speech.Voice[]> | null = null;

/** Android returns `[]` on the very first call after install (voices load async on the OS side)
 * — retry up to 10x at 500ms, per plan §3.5. */
async function loadVoicesWithRetry(): Promise<Speech.Voice[]> {
  for (let i = 0; i < 10; i++) {
    const voices = await Speech.getAvailableVoicesAsync().catch(() => [] as Speech.Voice[]);
    if (voices.length > 0) return voices;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return [];
}

function getVoices(): Promise<Speech.Voice[]> {
  if (voicesCache) return Promise.resolve(voicesCache);
  if (!voicesPromise) {
    voicesPromise = loadVoicesWithRetry().then((v) => {
      voicesCache = v;
      return v;
    });
  }
  return voicesPromise;
}

function hasVoiceFor(voices: Speech.Voice[], locale: string): boolean {
  const base = locale.split("-")[0];
  return voices.some((v) => v.language === locale || v.language.split("-")[0] === base);
}

export type VoiceAvailability = "unknown" | "available" | "missing";

const availability: Record<Lang, VoiceAvailability> = {
  en: "available",
  si: "unknown",
  ta: "unknown",
};

/** Checks (once, cached) whether `lang`'s voice is installed. Call before the first announcement
 * in that language so `say()` can silently fall back to English instead of erroring. */
export async function ensureVoice(lang: Lang): Promise<VoiceAvailability> {
  if (lang === "en") return "available";
  const voices = await getVoices();
  availability[lang] = hasVoiceFor(voices, VOICE_LOCALE[lang]) ? "available" : "missing";
  return availability[lang];
}

export function voiceAvailability(lang: Lang): VoiceAvailability {
  return availability[lang];
}

function pump() {
  if (speaking) return;
  const next = queue.shift();
  if (!next) return;
  speaking = true;
  const locale = availability[next.lang] === "missing" ? VOICE_LOCALE.en : VOICE_LOCALE[next.lang];
  const finish = () => {
    speaking = false;
    pump();
  };
  Speech.speak(next.text, { language: locale, onDone: finish, onStopped: finish, onError: finish });
}

/** Queues a phrase for speech. Never overlaps a previous one — a rain warning and a turn
 * announcement that land at the same moment are spoken one after the other, not on top of
 * each other. Falls back to English if `lang`'s voice isn't installed. */
export function say(text: string, lang: Lang): void {
  if (!text) return;
  queue.push({ text, lang });
  pump();
}

/** Convenience: speak a dictionary key in `lang` (mirrors the old `speak(lang, key)` helper). */
export function speak(lang: Lang, key: keyof AppStrings): void {
  say(String(STR[lang][key]), lang);
}

export function stopAll(): void {
  queue = [];
  Speech.stop();
  speaking = false;
}

// One-time "download voice" prompt bookkeeping. The Alert/UI itself is shown by the caller
// (map.tsx uses this to decide whether to show it at all) — this just remembers we already
// asked for this language so a rider isn't nagged on every ride.
const PROMPTED_KEY_PREFIX = "roto-voice-prompted-";

export async function hasPromptedVoiceDownload(lang: Lang): Promise<boolean> {
  return (await SecureStore.getItemAsync(`${PROMPTED_KEY_PREFIX}${lang}`).catch(() => null)) === "1";
}

export async function markPromptedVoiceDownload(lang: Lang): Promise<void> {
  await SecureStore.setItemAsync(`${PROMPTED_KEY_PREFIX}${lang}`, "1").catch(() => undefined);
}
