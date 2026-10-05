// Module 1: road signs (plan §5.3, D12). Original summary text — not copied from any handbook.
import type { LearnModule } from "./types";

export const roadSigns: LearnModule = {
  slug: "road-signs",
  title: { en: "Road signs", si: "මාර්ග සංඥා", ta: "சாலை அறிகுறிகள்" },
  body: {
    en: "Sri Lankan road signs follow three families. Regulatory signs are rules you must obey: red circles forbid (no entry, no overtaking, speed limit), blue circles order (keep left, turn), octagons stop. Warning signs are red-bordered triangles that tell you what is ahead — bends, junctions, pedestrian crossings, railway crossings. Informatory signs are blue or green rectangles that guide you to places, distances and lanes.\n\nOn a bike you read signs earlier than cars do, because you need more time to slow down safely. When you see a warning triangle, cover both brakes and check your mirrors. A speed-limit circle is the maximum for perfect conditions, not a target in rain or gravel.\n\nExpressway signs are green with white text. Motorcycles are not allowed on expressways (E01–E04), so a green direction sign pointing at an expressway on-ramp is a sign to stay out. Roto's routing never sends you there.",
    si: "ශ්‍රී ලංකාවේ මාර්ග සංඥා කාණ්ඩ තුනකි. නියාමන සංඥා පිළිපැදිය යුතු නීති වේ: රතු රවුම් තහනම් කරයි (ඇතුළු වීම තහනම්, overtake තහනම්, වේග සීමා), නිල් රවුම් අණ කරයි (වමෙන් යන්න, හැරෙන්න), අෂ්ටාස්‍ර නවත්වයි. අනතුරු ඇඟවීමේ සංඥා රතු මායිම් සහිත ත්‍රිකෝණ වේ — ඉදිරියේ ඇති වංගු, මංසන්ධි, පදික මාරු, දුම්රිය හරස් මාර්ග කියයි. තොරතුරු සංඥා නිල් හෝ කොළ සෘජුකෝණාස්‍ර වන අතර ස්ථාන, දුර සහ මංතීරු පෙන්වයි.\n\nබයික් එකකදී සංඥා කලින් කියවන්න, ආරක්ෂිතව වේගය අඩු කිරීමට වැඩි කාලයක් අවශ්‍ය නිසා. අනතුරු ඇඟවීමේ ත්‍රිකෝණයක් දුටු විට brake දෙකම ආවරණය කර කණ්නාඩි බලන්න. වේග සීමා රවුම පරිපූර්ණ තත්ත්වයන් සඳහා උපරිමය මිස වැස්සේ හෝ බොරළු මත ඉලක්කයක් නොවේ.\n\nඅධිවේගී මාර්ග සංඥා සුදු අකුරු සහිත කොළ පාටයි. යතුරුපැදි අධිවේගී මාර්ගවලට (E01–E04) ඇතුළු විය නොහැක, එබැවින් එවැනි පිවිසුමක් පෙන්වන කොළ සංඥාවක් යනු ඉවත් වී සිටිය යුතු බවයි.",
    ta: "இலங்கை சாலை அறிகுறிகள் மூன்று வகை. ஒழுங்குமுறை அறிகுறிகள் கண்டிப்பாகப் பின்பற்ற வேண்டிய விதிகள்: சிவப்பு வட்டங்கள் தடை செய்கின்றன (நுழையக் கூடாது, முந்தக் கூடாது, வேக வரம்பு), நீல வட்டங்கள் கட்டளையிடுகின்றன (இடதுபுறம் செல், திரும்பு), எண்கோணம் நிறுத்து. எச்சரிக்கை அறிகுறிகள் சிவப்பு விளிம்பு முக்கோணங்கள் — முன்னால் உள்ள வளைவுகள், சந்திப்புகள், பாதசாரி கடப்புகள், ரயில் கடவுகளைக் கூறும். தகவல் அறிகுறிகள் நீல அல்லது பச்சை செவ்வகங்கள், இடங்கள், தூரங்கள், பாதைகளைக் காட்டும்.\n\nபைக்கில் அறிகுறிகளை முன்கூட்டியே படியுங்கள், பாதுகாப்பாக மெதுவாக்க அதிக நேரம் தேவை. எச்சரிக்கை முக்கோணம் கண்டால் இரு பிரேக்குகளையும் மூடி கண்ணாடிகளைப் பார்க்கவும். வேக வரம்பு வட்டம் சரியான நிலைமைகளுக்கான அதிகபட்சம், மழையில் அல்லது சரளையில் இலக்கு அல்ல.\n\nஅதிவேக நெடுஞ்சாலை அறிகுறிகள் வெள்ளை எழுத்துடன் பச்சை. மோட்டார் சைக்கிள்கள் அதிவேக நெடுஞ்சாலைகளில் (E01–E04) அனுமதிக்கப்படுவதில்லை, எனவே அங்கு செல்லும் பச்சை அறிகுறி விலகியிருக்க வேண்டும் என்பதாகும்.",
  },
  quiz: [
    {
      q: { en: "What does a red-bordered triangular sign mean?", si: "රතු මායිම් සහිත ත්‍රිකෝණ සංඥාවක තේරුම කුමක්ද?", ta: "சிவப்பு விளிம்பு முக்கோண அறிகுறியின் பொருள் என்ன?" },
      a: {
        en: ["Warning of something ahead", "You must stop", "Information only", "End of all restrictions"],
        si: ["ඉදිරියේ යමක් ගැන අනතුරු ඇඟවීම", "ඔබ නැවතිය යුතුයි", "තොරතුරු පමණි", "සියලු සීමා අවසන්"],
        ta: ["முன்னால் உள்ளதைப் பற்றிய எச்சரிக்கை", "நீங்கள் நிற்க வேண்டும்", "தகவல் மட்டும்", "அனைத்து கட்டுப்பாடுகளும் முடிவு"],
      },
      correct: 0,
    },
    {
      q: { en: "A red circle with a number inside means…", si: "අංකයක් සහිත රතු රවුමක තේරුම…", ta: "எண் உள்ள சிவப்பு வட்டம் என்றால்…" },
      a: {
        en: ["Maximum speed limit", "Minimum speed", "Distance to town", "Route number"],
        si: ["උපරිම වේග සීමාව", "අවම වේගය", "නගරයට දුර", "මාර්ග අංකය"],
        ta: ["அதிகபட்ச வேக வரம்பு", "குறைந்தபட்ச வேகம்", "நகரத்திற்கு தூரம்", "வழி எண்"],
      },
      correct: 0,
    },
    {
      q: { en: "An octagonal (8-sided) sign means…", si: "අෂ්ටාස්‍ර (පැති 8) සංඥාවක තේරුම…", ta: "எண்கோண அறிகுறி என்றால்…" },
      a: {
        en: ["Give way only", "Stop completely", "No parking", "One-way street"],
        si: ["මාර්ගය දෙන්න පමණි", "සම්පූර්ණයෙන් නවත්වන්න", "නැවැත්වීම තහනම්", "ඒක දිශා මාර්ගය"],
        ta: ["வழி விடுங்கள் மட்டும்", "முழுமையாக நிறுத்தவும்", "நிறுத்தக் கூடாது", "ஒருவழிப் பாதை"],
      },
      correct: 1,
    },
    {
      q: { en: "Why should a rider read warning signs earlier than a car driver?", si: "මෝටර් රථ රියදුරෙකුට වඩා බයික් රියදුරෙකු අනතුරු ඇඟවීමේ සංඥා කලින් කියවිය යුත්තේ ඇයි?", ta: "கார் ஓட்டுநரை விட பைக் ஓட்டுநர் எச்சரிக்கை அறிகுறிகளை முன்கூட்டியே படிப்பது ஏன்?" },
      a: {
        en: ["Bikes need more time to slow down safely", "Bikes are faster than cars", "Signs are smaller for bikes", "Bikes cannot use brakes"],
        si: ["බයික් ආරක්ෂිතව වේගය අඩු කිරීමට වැඩි කාලයක් ගනී", "බයික් මෝටර් රථවලට වඩා වේගවත්", "බයික් සඳහා සංඥා කුඩායි", "බයික්වල brake භාවිත කළ නොහැක"],
        ta: ["பைக்குகள் பாதுகாப்பாக மெதுவாக்க அதிக நேரம் தேவை", "பைக்குகள் கார்களை விட வேகம்", "பைக்குகளுக்கு அறிகுறிகள் சிறியவை", "பைக்குகளில் பிரேக் பயன்படுத்த முடியாது"],
      },
      correct: 0,
    },
    {
      q: { en: "Green direction signs with white text point to…", si: "සුදු අකුරු සහිත කොළ දිශා සංඥා යොමු වන්නේ…", ta: "வெள்ளை எழுத்துடன் பச்சை திசை அறிகுறிகள் காட்டுவது…" },
      a: {
        en: ["Expressways, which motorcycles must not enter", "Bicycle lanes", "Fuel stations only", "Hospital zones"],
        si: ["යතුරුපැදි ඇතුළු විය නොහැකි අධිවේගී මාර්ගවලට", "පාපැදි මංතීරුවලට", "ඉන්ධන පිරවුම්හල්වලට පමණි", "රෝහල් කලාපවලට"],
        ta: ["மோட்டார் சைக்கிள்கள் நுழையக் கூடாத அதிவேக நெடுஞ்சாலைகளுக்கு", "சைக்கிள் பாதைகளுக்கு", "எரிபொருள் நிலையங்களுக்கு மட்டும்", "மருத்துவமனை மண்டலங்களுக்கு"],
      },
      correct: 0,
    },
    {
      q: { en: "A blue circle with a white arrow pointing left orders you to…", si: "වමට යොමු වන සුදු ඊතලයක් සහිත නිල් රවුමක් ඔබට අණ කරන්නේ…", ta: "இடதுபுறம் காட்டும் வெள்ளை அம்புடன் நீல வட்டம் உங்களுக்கு…" },
      a: {
        en: ["Turn left if you wish", "Keep left / go left", "No left turn", "U-turn allowed"],
        si: ["කැමති නම් වමට හැරෙන්න", "වමෙන් යන්න", "වමට හැරීම තහනම්", "U-turn අවසරයි"],
        ta: ["விரும்பினால் இடதுபுறம் திரும்பவும்", "இடதுபுறம் செல்லவும்", "இடதுபுறம் திரும்பக் கூடாது", "U-டர்ன் அனுமதி"],
      },
      correct: 1,
    },
    {
      q: { en: "When you see a warning triangle, the first thing to do is…", si: "අනතුරු ඇඟවීමේ ත්‍රිකෝණයක් දුටු විට කළ යුතු පළමු දෙය…", ta: "எச்சரிக்கை முக்கோணம் கண்டால் முதலில் செய்ய வேண்டியது…" },
      a: {
        en: ["Speed up to pass quickly", "Cover both brakes and check mirrors", "Close your eyes briefly", "Honk continuously"],
        si: ["ඉක්මනින් පසු කිරීමට වේගය වැඩි කරන්න", "brake දෙකම ආවරණය කර කණ්නාඩි බලන්න", "මොහොතක් ඇස් වසන්න", "දිගටම horn ගසන්න"],
        ta: ["விரைவாகக் கடக்க வேகத்தை அதிகரிக்கவும்", "இரு பிரேக்குகளையும் மூடி கண்ணாடிகளைப் பார்க்கவும்", "சிறிது நேரம் கண்களை மூடவும்", "தொடர்ந்து ஹாரன் அடிக்கவும்"],
      },
      correct: 1,
    },
    {
      q: { en: "A sign showing a motorcycle inside a red circle means…", si: "රතු රවුමක් ඇතුළත යතුරුපැදියක් පෙන්වන සංඥාවක තේරුම…", ta: "சிவப்பு வட்டத்திற்குள் மோட்டார் சைக்கிள் காட்டும் அறிகுறி…" },
      a: {
        en: ["Motorcycle parking ahead", "No motorcycles beyond this point", "Motorcycle repair shop", "Motorcycles must go faster"],
        si: ["ඉදිරියේ යතුරුපැදි නැවැත්වීම", "මෙතැනින් එහා යතුරුපැදි තහනම්", "යතුරුපැදි අලුත්වැඩියා ස්ථානය", "යතුරුපැදි වේගයෙන් යා යුතුයි"],
        ta: ["முன்னால் மோட்டார் சைக்கிள் நிறுத்தம்", "இதற்கு அப்பால் மோட்டார் சைக்கிள்கள் தடை", "மோட்டார் சைக்கிள் பழுதுபார்க்கும் இடம்", "மோட்டார் சைக்கிள்கள் வேகமாகச் செல்ல வேண்டும்"],
      },
      correct: 1,
    },
    {
      q: { en: "Blue or green rectangular signs are for…", si: "නිල් හෝ කොළ සෘජුකෝණාස්‍ර සංඥා…", ta: "நீல அல்லது பச்சை செவ்வக அறிகுறிகள்…" },
      a: {
        en: ["Orders you must obey", "Warnings of danger", "Guidance: places, distances, lanes", "Bans on overtaking"],
        si: ["පිළිපැදිය යුතු අණ", "අනතුරු ඇඟවීම්", "මඟ පෙන්වීම: ස්ථාන, දුර, මංතීරු", "overtake තහනම්"],
        ta: ["பின்பற்ற வேண்டிய கட்டளைகள்", "ஆபத்து எச்சரிக்கைகள்", "வழிகாட்டல்: இடங்கள், தூரங்கள், பாதைகள்", "முந்துதல் தடை"],
      },
      correct: 2,
    },
    {
      q: { en: "A posted speed limit in rain or on gravel is…", si: "වැස්සේ හෝ බොරළු මත ප්‍රදර්ශිත වේග සීමාව…", ta: "மழையில் அல்லது சரளையில் காட்டப்படும் வேக வரம்பு…" },
      a: {
        en: ["A minimum you must keep above", "The maximum for perfect conditions — go slower", "Only for cars", "Ignored at night"],
        si: ["පවත්වා ගත යුතු අවමය", "පරිපූර්ණ තත්ත්වයන් සඳහා උපරිමය — මන්දගාමීව යන්න", "මෝටර් රථ සඳහා පමණි", "රාත්‍රියේ නොසලකා හරින්න"],
        ta: ["பராமரிக்க வேண்டிய குறைந்தபட்சம்", "சரியான நிலைமைகளுக்கான அதிகபட்சம் — மெதுவாகச் செல்லவும்", "கார்களுக்கு மட்டும்", "இரவில் புறக்கணிக்கவும்"],
      },
      correct: 1,
    },
  ],
};
