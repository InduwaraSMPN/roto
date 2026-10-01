import type { Lang } from "@/lib/lang";

// Colocated dictionary (D4 open: no next-intl — en/si/ta keyed dicts per route).
export const dict: Record<Lang, Record<string, string>> = {
  en: {
    title: "Dealers, service & spares",
    sub: "Independent LK service network by brand. Call ahead — hours change.",
    allBrands: "All brands",
    call: "Call",
    navigate: "Navigate",
    hours: "Hours",
    unverified: "unverified — call ahead",
    parts: "Find parts or bikes",
    partsNote: "Riyasewana link pattern is unverified (D13 open) — if the search page 404s, search the brand by hand.",
    empty: "No dealers listed for this brand yet.",
    loadFail: "Dealer list is unavailable right now. Check the connection and reload.",
  },
  si: {
    title: "අලෙවි නියෝජිතයෝ, සේවා සහ අමතර කොටස්",
    sub: "වෙළඳ නාමය අනුව ස්වාධීන LK සේවා ජාලය. යාමට පෙර අමතන්න.",
    allBrands: "සියලු වෙළඳ නාම",
    call: "අමතන්න",
    navigate: "මාර්ගය",
    hours: "වේලාවන්",
    unverified: "තහවුරු නැත — අමතා බලන්න",
    parts: "කොටස් හෝ බයික් සොයන්න",
    partsNote: "Riyasewana සබැඳි රටාව තහවුරු නැත — පිටුව නොමැති නම් වෙළඳ නාමය අතින් සොයන්න.",
    empty: "මෙම වෙළඳ නාමයට තවම ලැයිස්තු නැත.",
    loadFail: "ලැයිස්තුව දැන් නොමැත. සම්බන්ධතාව පරීක්ෂා කර නැවත උත්සාහ කරන්න.",
  },
  ta: {
    title: "டீலர்கள், சேவை & உதிரிபாகங்கள்",
    sub: "பிராண்ட் வாரியாக சுயாதீன LK சேவை வலையமைப்பு. செல்லுமுன் அழைக்கவும்.",
    allBrands: "அனைத்து பிராண்டுகள்",
    call: "அழைக்கவும்",
    navigate: "வழி",
    hours: "நேரம்",
    unverified: "சரிபார்க்கப்படவில்லை — அழைத்துப் பார்க்கவும்",
    parts: "பாகங்கள் அல்லது பைக்குகளைத் தேடுக",
    partsNote: "Riyasewana இணைப்பு வடிவம் சரிபார்க்கப்படவில்லை — பக்கம் இல்லையெனில் பிராண்டை கைமுறையில் தேடவும்.",
    empty: "இந்த பிராண்டிற்கு இன்னும் பட்டியல் இல்லை.",
    loadFail: "பட்டியல் இப்போது இல்லை. இணைப்பைச் சரிபார்த்து மீண்டும் முயலவும்.",
  },
};
