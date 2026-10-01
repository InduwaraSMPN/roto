import type { Lang } from "@/lib/lang";

// Colocated dictionary (D4 open: no next-intl — en/si/ta keyed dicts per route).
export const dict: Record<Lang, Record<string, string>> = {
  en: {
    missing: "This ride link is unavailable.",
    missingSub: "The ride may be private, deleted, or the sharing backend is still being built.",
    replay: "Replay",
    scrubHint: "Drag the slider to move the marker along the ride.",
    flyover: "3D flyover lives in the planner (planner-agent owned) — this page stays a flat replay.",
    downloadGpx: "Download GPX",
    openInApp: "Open in app",
    hiddenMax: "Rider hides max speed",
    photos: "Photos",
    noPhotos: "No photos pinned to this ride.",
  },
  si: {
    missing: "මෙම ගමන් සබැඳිය නොමැත.",
    missingSub: "ගමන පෞද්ගලික විය හැකියි, මකා දැමූවා විය හැකියි, නැතිනම් බෙදාගැනීමේ පසුබිම තවම හැදෙමින් පවතී.",
    replay: "නැවත ධාවනය",
    scrubHint: "සලකුණ ගමන දිගේ ගෙන යාමට ස්ලයිඩරය අදින්න.",
    flyover: "ත්‍රිමාණ පියාසර දසුන සැලසුම් පිටුවේ ඇත — මෙය පැතලි නැවත ධාවනයකි.",
    downloadGpx: "GPX බාගන්න",
    openInApp: "ඇප් එකෙන් අරින්න",
    hiddenMax: "ධාවකයා උපරිම වේගය සඟවයි",
    photos: "ඡායාරූප",
    noPhotos: "මෙම ගමනට ඡායාරූප නැත.",
  },
  ta: {
    missing: "இந்த சவாரி இணைப்பு இல்லை.",
    missingSub: "சவாரி தனிப்பட்டதாக இருக்கலாம், நீக்கப்பட்டிருக்கலாம், அல்லது பகிர்வு பின்புலம் இன்னும் கட்டப்படுகிறது.",
    replay: "மீண்டும் இயக்கு",
    scrubHint: "குறியீட்டை சவாரிப் பாதையில் நகர்த்த ஸ்லைடரை இழுக்கவும்.",
    flyover: "3D மேம்பறப்பு திட்டமிடல் பக்கத்தில் உள்ளது — இது தட்டையான மீளியக்கம்.",
    downloadGpx: "GPX பதிவிறக்கம்",
    openInApp: "செயலியில் திறக்கவும்",
    hiddenMax: "சவாரியாளர் அதிகபட்ச வேகத்தை மறைக்கிறார்",
    photos: "புகைப்படங்கள்",
    noPhotos: "இந்த சவாரியில் புகைப்படங்கள் இல்லை.",
  },
};
