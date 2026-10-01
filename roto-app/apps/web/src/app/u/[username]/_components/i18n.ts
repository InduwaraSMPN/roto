import type { Lang } from "@/lib/lang";

// Colocated dictionary (D4 open: no next-intl — en/si/ta keyed dicts per route).
export const dict: Record<Lang, Record<string, string>> = {
  en: {
    missing: "This rider page is unavailable.",
    missingSub: "The profile may be private, renamed, or the community backend is still being built.",
    publicRides: "Public rides",
    badges: "Badges",
    noBadges: "No badges yet.",
    noRides: "No public rides yet.",
    hiddenMax: "Rider hides max speed",
  },
  si: {
    missing: "මෙම ධාවක පිටුව නොමැත.",
    missingSub: "පැතිකඩ පෞද්ගලික විය හැකියි, නම වෙනස් වූවා විය හැකියි, නැතිනම් ප්‍රජා පසුබිම තවම හැදෙමින් පවතී.",
    publicRides: "ප්‍රසිද්ධ ගමන්",
    badges: "සම්මාන",
    noBadges: "තවම සම්මාන නැත.",
    noRides: "තවම ප්‍රසිද්ධ ගමන් නැත.",
    hiddenMax: "ධාවකයා උපරිම වේගය සඟවයි",
  },
  ta: {
    missing: "இந்த சவாரியாளர் பக்கம் இல்லை.",
    missingSub: "சுயவிவரம் தனிப்பட்டதாக இருக்கலாம், பெயர் மாறியிருக்கலாம், அல்லது சமூக பின்புலம் இன்னும் கட்டப்படுகிறது.",
    publicRides: "பொது சவாரிகள்",
    badges: "பதக்கங்கள்",
    noBadges: "இன்னும் பதக்கங்கள் இல்லை.",
    noRides: "இன்னும் பொது சவாரிகள் இல்லை.",
    hiddenMax: "சவாரியாளர் அதிகபட்ச வேகத்தை மறைக்கிறார்",
  },
};
