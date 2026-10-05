// Static how-to guides (plan §5.3): revenue licence renewal, emission test, insurance
// renewal, ownership transfer. General guidance, not legal advice — each guide ends with
// a "confirm current rules" step. Original text.
import type { Guide } from "./types";

export const revenueLicenceGuide: Guide = {
  slug: "revenue-licence",
  title: { en: "Revenue licence renewal", si: "ආදායම් බලපත්‍රය අලුත් කිරීම", ta: "வருவாய் உரிமப் புதுப்பிப்பு" },
  steps: {
    en: [
      "Check the expiry date on your current revenue licence — set a Roto garage reminder a month before.",
      "Make sure your insurance is valid first; you cannot renew without it.",
      "Get the emission test done if your bike's age requires it, and keep the certificate.",
      "Renew at the divisional secretariat counter or online, pay the fee, and keep the receipt with the licence.",
      "Confirm the current fee and required documents with the DMT or secretariat before you go — rules change.",
    ],
    si: [
      "වත්මන් ආදායම් බලපත්‍රයේ කල් ඉකුත් වන දිනය බලන්න — මාසයකට පෙර Roto garage මතක් කිරීමක් සකසන්න.",
      "පළමුව ඔබේ රක්ෂණය වලංගු බව තහවුරු කරන්න; එය නොමැතිව අලුත් කළ නොහැක.",
      "ඔබේ බයික් වයසට අවශ්‍ය නම් විමෝචන පරීක්ෂණය කර සහතිකය ළඟ තබා ගන්න.",
      "ප්‍රාදේශීය ලේකම් කාර්යාලයෙන් හෝ online මගින් අලුත් කර, ගාස්තුව ගෙවා, රිසිට් එක බලපත්‍රය සමඟ තබා ගන්න.",
      "යාමට පෙර වත්මන් ගාස්තු සහ අවශ්‍ය ලේඛන DMT හෝ ලේකම් කාර්යාලයෙන් තහවුරු කරන්න — නීති වෙනස් වේ.",
    ],
    ta: [
      "தற்போதைய வருவாய் உரிமத்தின் காலாவதி தேதியைப் பாருங்கள் — ஒரு மாதம் முன் Roto கேரேஜ் நினைவூட்டல் அமைக்கவும்.",
      "முதலில் காப்பீடு செல்லுபடியாகும் என்பதை உறுதி செய்யுங்கள்; அது இல்லாமல் புதுப்பிக்க முடியாது.",
      "பைக் வயதுக்குத் தேவைப்பட்டால் மாசு சோதனை செய்து சான்றிதழை வைத்திருங்கள்.",
      "பிரதேச செயலகத்தில் அல்லது ஆன்லைனில் புதுப்பித்து, கட்டணம் செலுத்தி, ரசீதை உரிமத்துடன் வைக்கவும்.",
      "செல்லும் முன் தற்போதைய கட்டணம், தேவையான ஆவணங்களை DMT/செயலகத்தில் உறுதி செய்யுங்கள் — விதிகள் மாறும்.",
    ],
  },
};

export const emissionTestGuide: Guide = {
  slug: "emission-test",
  title: { en: "Emission test", si: "විමෝචන පරීක්ෂණය", ta: "மாசு சோதனை" },
  steps: {
    en: [
      "Ride the bike for 10–15 minutes before the test so the engine is at full operating temperature.",
      "Check for exhaust leaks, a dirty air filter or a smoking exhaust — fix these first, they fail tests.",
      "Take the bike to an authorised emission testing centre with the revenue licence.",
      "If it fails, service the bike (tune, air filter, spark plug) and retest — keep both slips.",
      "Confirm the current test validity period and fee at the centre — they change.",
    ],
    si: [
      "පරීක්ෂණයට පෙර විනාඩි 10–15ක් බයික් එක යන්න එන්ජිම සම්පූර්ණ උෂ්ණත්වයට ඒමට.",
      "Exhaust කාන්දු, අපිරිසිදු air filter හෝ දුම් දමන exhaust බලන්න — පළමුව ඒවා සකසන්න, ඒවා අසමත් වීමට හේතු වේ.",
      "ආදායම් බලපත්‍රය සමඟ බලයලත් විමෝචන පරීක්ෂණ මධ්‍යස්ථානයකට බයික් එක ගෙන යන්න.",
      "අසමත් වුවහොත්, බයික් එක service කර (tune, air filter, spark plug) නැවත පරීක්ෂා කරන්න — slip දෙකම ළඟ තබා ගන්න.",
      "වත්මන් පරීක්ෂණ වලංගු කාලය සහ ගාස්තුව මධ්‍යස්ථානයෙන් තහවුරු කරන්න — ඒවා වෙනස් වේ.",
    ],
    ta: [
      "சோதனைக்கு முன் 10–15 நிமிடங்கள் பைக்கை ஓட்டி என்ஜின் முழு வெப்பநிலைக்கு வரச் செய்யுங்கள்.",
      "எக்ஸாஸ்ட் கசிவு, அழுக்கு ஏர் ஃபில்டர், புகை விடும் எக்ஸாஸ்ட் பாருங்கள் — முதலில் இவற்றைச் சரி செய்யுங்கள், இவை தோல்விக்குக் காரணம்.",
      "வருவாய் உரிமத்துடன் அங்கீகரிக்கப்பட்ட மாசு சோதனை மையத்திற்குச் செல்லுங்கள்.",
      "தோல்வியுற்றால், பைக்கை சர்வீஸ் செய்து (டியூன், ஏர் ஃபில்டர், ஸ்பார்க் பிளக்) மீண்டும் சோதியுங்கள் — இரு சீட்டுகளையும் வைக்கவும்.",
      "தற்போதைய சோதனை செல்லுபடி காலம், கட்டணத்தை மையத்தில் உறுதி செய்யுங்கள் — மாறும்.",
    ],
  },
};

export const insuranceGuide: Guide = {
  slug: "insurance",
  title: { en: "Insurance renewal", si: "රක්ෂණය අලුත් කිරීම", ta: "காப்பீட்டுப் புதுப்பிப்பு" },
  steps: {
    en: [
      "Check your policy expiry — set a Roto garage reminder a month before.",
      "Compare third-party vs full cover; third-party is the legal minimum for the road.",
      "Renew before expiry so there is no gap — a single uncovered day is a risk and blocks revenue licence renewal.",
      "Keep the policy (or certified copy) on the bike, plus a photo on your phone.",
      "If you buy a new bike, insure it before you ride it home.",
    ],
    si: [
      "ඔබේ policy කල් ඉකුත් වන දිනය බලන්න — මාසයකට පෙර Roto garage මතක් කිරීමක් සකසන්න.",
      "Third-party සහ full cover සසඳන්න; මාර්ගය සඳහා නීත්‍යානුකූල අවමය third-party වේ.",
      "කල් ඉකුත් වීමට පෙර අලුත් කරන්න හිඩැසක් නැතිව — එක් ආවරණය නොමැති දිනයක් අවදානමක් වන අතර ආදායම් බලපත්‍ර අලුත් කිරීම අවහිර කරයි.",
      "Policy එක (හෝ සහතික කළ පිටපත) බයික් එකේ තබා ගන්න, දුරකථනයේ ඡායාරූපයක්ද සමඟ.",
      "අලුත් බයික් එකක් මිලදී ගත්තොත්, ගෙදර යාමට පෙර එය රක්ෂණය කරන්න.",
    ],
    ta: [
      "பாலிசி காலாவதி தேதியைப் பாருங்கள் — ஒரு மாதம் முன் Roto கேரேஜ் நினைவூட்டல் அமைக்கவும்.",
      "மூன்றாம் தரப்பு vs முழு காப்பீட்டை ஒப்பிடுங்கள்; சாலைக்குச் சட்ட குறைந்தபட்சம் மூன்றாம் தரப்பு.",
      "காலாவதிக்கு முன் புதுப்பித்து இடைவெளி இல்லாமல் — ஒரு நாள் காப்பீடின்மை ஆபத்து, வருவாய் உரிமப் புதுப்பிப்பைத் தடுக்கும்.",
      "பாலிசியை (அல்லது சான்றளித்த நகல்) பைக்கில் வையுங்கள், தொலைபேசியில் புகைப்படத்துடன்.",
      "புதிய பைக் வாங்கினால், வீட்டிற்கு ஓட்டும் முன் காப்பீடு செய்யுங்கள்.",
    ],
  },
};

export const transferGuide: Guide = {
  slug: "transfer",
  title: { en: "Ownership transfer at the DMT", si: "DMT හි හිමිකාරිත්වය මාරු කිරීම", ta: "DMTயில் உரிமை மாற்றம்" },
  steps: {
    en: [
      "Seller and buyer agree in writing on price, date and who handles the transfer paperwork.",
      "Gather the revenue licence, insurance, emission certificate and both parties' IDs.",
      "Complete the transfer forms and submit at the DMT — until registered, fines still point at the seller.",
      "Buyer: insure the bike in your name before riding it regularly.",
      "Confirm the current forms, fees and queue process with the DMT before you go — they change.",
    ],
    si: [
      "විකුණුම්කරු සහ ගැනුම්කරු මිල, දිනය සහ මාරු ලේඛන කටයුතු කරන්නේ කවුද යන්න ලිඛිතව එකඟ වන්න.",
      "ආදායම් බලපත්‍රය, රක්ෂණය, විමෝචන සහතිකය සහ දෙපාර්ශ්වයේම හැඳුනුම්පත් එකතු කරන්න.",
      "මාරු ආකෘති පත්‍ර සම්පූර්ණ කර DMT වෙත භාර දෙන්න — ලියාපදිංචි වන තෙක් දඩ විකුණුම්කරු වෙත යොමු වේ.",
      "ගැනුම්කරු: නිතිපතා ධාවනයට පෙර ඔබේ නමින් බයික් එක රක්ෂණය කරන්න.",
      "යාමට පෙර වත්මන් ආකෘති, ගාස්තු සහ පෝලිම් ක්‍රියාවලිය DMTයෙන් තහවුරු කරන්න — ඒවා වෙනස් වේ.",
    ],
    ta: [
      "விற்பவர், வாங்குபவர் விலை, தேதி, மாற்ற ஆவணங்களை யார் கையாள்வது என்பதை எழுத்தில் ஒப்புக்கொள்ளுங்கள்.",
      "வருவாய் உரிமம், காப்பீடு, மாசுச் சான்றிதழ், இரு தரப்பு அடையாளங்களைச் சேகரியுங்கள்.",
      "மாற்றப் படிவங்களை நிரப்பி DMTயில் சமர்ப்பியுங்கள் — பதிவாகும் வரை அபராதங்கள் விற்பவரையே சுட்டும்.",
      "வாங்குபவர்: தொடர்ந்து ஓட்டும் முன் உங்கள் பெயரில் பைக்கைக் காப்பீடு செய்யுங்கள்.",
      "செல்லும் முன் தற்போதைய படிவங்கள், கட்டணங்கள், வரிசை முறையை DMTயில் உறுதி செய்யுங்கள் — மாறும்.",
    ],
  },
};

export const GUIDES: Guide[] = [revenueLicenceGuide, emissionTestGuide, insuranceGuide, transferGuide];
