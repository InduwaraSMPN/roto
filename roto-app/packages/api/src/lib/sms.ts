// ponytail: D3 — provider interface with a `none` default. Crash/SOS alerts go out on free
// channels (push/email, implemented in lib/push.ts and lib/email.ts); server-side SMS needs a
// paid LK gateway (Notify.lk/Text.lk/Dialog/Twilio) that a sponsor plugs in later by setting
// SMS_PROVIDER + key. No other code changes when that happens: safety.trigger calls sendSms()
// and records whatever provider reports in sos_events.channels.
export type SmsResult = {
  provider: string;
  sent: number;
  failed: number;
};

export type SosLang = "en" | "si" | "ta";

const SMS_TEXT: Record<SosLang, (name: string, url: string) => string> = {
  en: (name, url) => `Roto SOS: ${name} may have crashed. Live location: ${url}. Call 1990 for an ambulance.`,
  si: (name, url) => `Roto SOS: ${name} අනතුරකට ලක්විය හැක. සජීවී ස්ථානය: ${url}. ගිලන් රථයට 1990 අමතන්න.`,
  ta: (name, url) => `Roto SOS: ${name} விபத்தில் சிக்கியிருக்கலாம். நேரடி இடம்: ${url}. ஆம்புலன்சுக்கு 1990 அழைக்கவும்.`,
};

/** Trilingual SOS text per contact language (plan §4.12). si/ta by non-native speaker — review before store release. */
export function sosTextFor(lang: string, name: string, url: string): string {
  const fn = lang === "si" ? SMS_TEXT.si : lang === "ta" ? SMS_TEXT.ta : SMS_TEXT.en;
  return fn(name, url);
}

export async function sendSms(to: string[], text: string): Promise<SmsResult> {
  const provider = process.env.SMS_PROVIDER ?? "none";
  if (provider === "none" || to.length === 0) {
    // D3: no gateway configured — the phone's SMS composer is the fallback (see native lib/safety.ts).
    void text;
    return { provider: "none", sent: 0, failed: 0 };
  }
  // A sponsor's gateway plugs in here (e.g. Notify.lk/Text.lk/Dialog/Twilio) behind SMS_PROVIDER.
  throw new Error(`unknown SMS_PROVIDER "${provider}"`);
}
