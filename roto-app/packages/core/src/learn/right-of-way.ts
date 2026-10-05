// Module 2: right of way, lanes and overtaking. Original text.
import type { LearnModule } from "./types";

export const rightOfWay: LearnModule = {
  slug: "right-of-way",
  title: { en: "Right of way, lanes & overtaking", si: "ප්‍රමුඛතාව, මංතීරු සහ overtake", ta: "முன்னுரிமை, பாதைகள் மற்றும் முந்துதல்" },
  body: {
    en: "Sri Lanka drives on the left. Keep left unless you are overtaking, and treat the left edge as your home — but watch for parked vehicles, pedestrians and drains opening car doors into it. At unmarked junctions, the vehicle already on the main road has priority; slow down and be ready to stop even when you think you have the right of way.\n\nOvertake only on the right, only where you can see far ahead, and never on bends, hill crests, junctions or pedestrian crossings. A bike is narrow, but squeezing between a bus and the center line is not overtaking — it is a head-on crash waiting for space. Signal, check your mirror and blind spot, pass decisively, then signal back left.\n\nRoundabouts: give way to traffic already on the roundabout, coming from your right. Enter slowly, stay in your lane, and signal left just before your exit. Never stop inside a roundabout to check your phone or route.",
    si: "ශ්‍රී ලංකාවේ වමෙන් ධාවනය කරයි. overtake කරන විට හැර වමෙන් සිටින්න, වම් කෙළවර ඔබේ නිවස ලෙස සලකන්න — නමුත් නවතා ඇති වාහන, පදිකයින් සහ දොරවල් අරින මෝටර් රථ ගැන විමසිලිමත් වන්න. සලකුණු නොකළ මංසන්ධිවලදී, ප්‍රධාන මාර්ගයේ දැනට යන වාහනයට ප්‍රමුඛතාව ඇත; ඔබට ප්‍රමුඛතාව ඇතැයි සිතුවත් වේගය අඩු කර නැවැත්වීමට සූදානම් වන්න.\n\nOvertake කරන්න දකුණින් පමණි, දුර ඈත පෙනෙන තැන පමණි, වංගු, කඳු මුදුන්, මංසන්ධි හෝ පදික මාරු මත කිසි විටෙකත් නොකරන්න. බයික් එක පටුයි, නමුත් බස් එකක් සහ මැද ඉර අතරින් රිංගීම overtake කිරීමක් නොවේ — එය ඉදිරියෙන් එන අනතුරකි. signal දෙන්න, කණ්නාඩිය සහ blind spot බලන්න, තීරණාත්මකව පසු කරන්න, ඉන්පසු වමට signal දෙන්න.\n\nරවුම් සන්ධි: දැනට සන්ධියේ ඇති, ඔබේ දකුණෙන් එන වාහනවලට මාර්ගය දෙන්න. සෙමින් ඇතුළු වන්න, ඔබේ මංතීරුවේ සිටින්න, පිටවීමට පෙර වමට signal දෙන්න. දුරකථනය හෝ මාර්ගය බැලීමට රවුම් සන්ධියක් ඇතුළත කිසි විටෙකත් නවත්වන්න එපා.",
    ta: "இலங்கையில் இடதுபுறம் ஓட்ட வேண்டும். முந்தும்போது தவிர இடதுபுறம் இருங்கள், இடது விளிம்பை உங்கள் இடமாகக் கருதுங்கள் — ஆனால் நிறுத்தப்பட்ட வாகனங்கள், பாதசாரிகள், கதவு திறக்கும் கார்களைக் கவனியுங்கள். குறியிடப்படாத சந்திப்புகளில், பிரதான சாலையில் ஏற்கனவே செல்லும் வாகனத்திற்கு முன்னுரிமை; உங்களுக்கு முன்னுரிமை என்று நினைத்தாலும் மெதுவாக்கி நிற்கத் தயாராகுங்கள்.\n\nவலதுபுறம் மட்டும், தொலைவில் தெரியும் இடத்தில் மட்டும் முந்துங்கள்; வளைவுகள், மலை உச்சிகள், சந்திப்புகள், பாதசாரி கடப்புகளில் ஒருபோதும் வேண்டாம். பைக் குறுகலானது, ஆனால் பஸ்ஸுக்கும் மையக் கோட்டிற்கும் இடையில் நுழைவது முந்துதல் அல்ல — அது நேருக்கு நேர் விபத்து. சிக்னல் கொடுங்கள், கண்ணாடி மற்றும் குருட்டுப் புள்ளியைப் பாருங்கள், உறுதியாகக் கடந்து, பின் இடதுபுறம் சிக்னல் கொடுங்கள்.\n\nவட்டவழிகள்: ஏற்கனவே வட்டவழியில் உள்ள, உங்கள் வலதுபுறமிருந்து வரும் வாகனங்களுக்கு வழி விடுங்கள். மெதுவாக நுழையுங்கள், உங்கள் பாதையில் இருங்கள், வெளியேறுவதற்கு முன் இடதுபுறம் சிக்னல் கொடுங்கள். தொலைபேசி பார்க்க வட்டவழிக்குள் ஒருபோதும் நிற்க வேண்டாம்.",
  },
  quiz: [
    {
      q: { en: "Which side of the road do you ride on in Sri Lanka?", si: "ශ්‍රී ලංකාවේ මාර්ගයේ කුමන පැත්තේද යන්නේ?", ta: "இலங்கையில் சாலையின் எந்தப் பக்கம் செல்ல வேண்டும்?" },
      a: {
        en: ["Right", "Left", "Middle", "Either side"],
        si: ["දකුණ", "වම", "මැද", "කිසිම පැත්තක්"],
        ta: ["வலது", "இடது", "நடு", "எந்தப் பக்கமும்"],
      },
      correct: 1,
    },
    {
      q: { en: "You may overtake…", si: "Overtake කළ හැක්කේ…", ta: "நீங்கள் முந்தலாம்…" },
      a: {
        en: ["On the right with a clear view ahead", "On the left through traffic", "On bends if you are quick", "Over a hill crest"],
        si: ["ඉදිරිය පැහැදිලිව පෙනෙන විට දකුණින්", "වාහන අතරින් වමෙන්", "ඉක්මන් නම් වංගුවකදී", "කඳු මුදුනක් මතදී"],
        ta: ["முன்னால் தெளிவாகத் தெரியும்போது வலதுபுறம்", "போக்குவரத்தில் இடதுபுறம்", "வேகமாக இருந்தால் வளைவில்", "மலை உச்சியில்"],
      },
      correct: 0,
    },
    {
      q: { en: "At an unmarked junction, who has priority?", si: "සලකුණු නොකළ මංසන්ධියකදී ප්‍රමුඛතාව කාටද?", ta: "குறியிடப்படாத சந்திப்பில் முன்னுரிமை யாருக்கு?" },
      a: {
        en: ["The smaller vehicle", "The vehicle already on the main road", "The vehicle from the left", "Whoever honks first"],
        si: ["කුඩා වාහනයට", "දැනට ප්‍රධාන මාර්ගයේ යන වාහනයට", "වමෙන් එන වාහනයට", "පළමුව horn ගසන්නාට"],
        ta: ["சிறிய வாகனத்திற்கு", "பிரதான சாலையில் ஏற்கனவே செல்லும் வாகனத்திற்கு", "இடதுபுறமிருந்து வரும் வாகனத்திற்கு", "முதலில் ஹாரன் அடிப்பவருக்கு"],
      },
      correct: 1,
    },
    {
      q: { en: "Entering a roundabout, you give way to…", si: "රවුම් සන්ධියකට ඇතුළු වන විට මාර්ගය දෙන්නේ…", ta: "வட்டவழிக்குள் நுழையும்போது வழி விடுவது…" },
      a: {
        en: ["Traffic from your left", "Traffic already on the roundabout, from your right", "Pedestrians only", "Nobody — bikes go first"],
        si: ["ඔබේ වමෙන් එන වාහනවලට", "දැනට සන්ධියේ ඇති, ඔබේ දකුණෙන් එන වාහනවලට", "පදිකයින්ට පමණි", "කිසිවෙකුට නැත — බයික් පළමුව"],
        ta: ["உங்கள் இடதுபுறமிருந்து வருபவர்களுக்கு", "ஏற்கனவே வட்டவழியில் உள்ள, வலதுபுறமிருந்து வருபவர்களுக்கு", "பாதசாரிகளுக்கு மட்டும்", "யாருக்கும் இல்லை — பைக் முதலில்"],
      },
      correct: 1,
    },
    {
      q: { en: "Before moving out to overtake, you must…", si: "Overtake කිරීමට පිටතට යාමට පෙර කළ යුත්තේ…", ta: "முந்துவதற்கு வெளியே செல்லும் முன்…" },
      a: {
        en: ["Signal, check mirror and blind spot", "Honk and go", "Flash headlights only", "Nothing — bikes fit anywhere"],
        si: ["Signal දී, කණ්නාඩිය සහ blind spot බලන්න", "Horn ගසා යන්න", "Headlight පමණක් දල්වන්න", "කිසිවක් නැත — බයික් ඕනෑම තැනකට ගැලපේ"],
        ta: ["சிக்னல் கொடுத்து, கண்ணாடி மற்றும் குருட்டுப் புள்ளியைப் பார்க்கவும்", "ஹாரன் அடித்துச் செல்லவும்", "ஹெட்லைட் மட்டும்", "ஒன்றுமில்லை — பைக் எங்கும் பொருந்தும்"],
      },
      correct: 0,
    },
    {
      q: { en: "Squeezing between a bus and the center line is…", si: "බස් එකක් සහ මැද ඉර අතරින් රිංගීම…", ta: "பஸ்ஸுக்கும் மையக் கோட்டிற்கும் இடையில் நுழைவது…" },
      a: {
        en: ["Skilful riding", "Expected of bikes", "A likely head-on crash", "Fine at low speed"],
        si: ["දක්ෂ ධාවනය", "බයික්වලින් බලාපොරොත්තු වන දෙය", "ඉදිරියෙන් එන අනතුරක්", "මන්දගාමීව නම් හොඳයි"],
        ta: ["திறமையான ஓட்டம்", "பைக்குகளிடம் எதிர்பார்க்கப்படுவது", "நேருக்கு நேர் விபத்து", "மெதுவாக இருந்தால் பரவாயில்லை"],
      },
      correct: 2,
    },
    {
      q: { en: "When do you signal left after overtaking?", si: "Overtake කිරීමෙන් පසු වමට signal දෙන්නේ කවදාද?", ta: "முந்திய பின் இடதுபுறம் சிக்னல் எப்போது?" },
      a: {
        en: ["Never — others can see you", "Before moving back to the left", "After you have parked", "Only at night"],
        si: ["කිසි විටෙකත් නැත — අනුන්ට පෙනේ", "වමට ආපසු යාමට පෙර", "නැවැත්වීමෙන් පසු", "රාත්‍රියේ පමණි"],
        ta: ["ஒருபோதும் — மற்றவர்கள் உங்களைப் பார்க்கலாம்", "இடதுபுறம் திரும்பும் முன்", "நிறுத்திய பின்", "இரவில் மட்டும்"],
      },
      correct: 1,
    },
    {
      q: { en: "Your 'home' position on the road is…", si: "මාර්ගයේ ඔබේ 'නිවස' ස්ථානය…", ta: "சாலையில் உங்கள் 'வீட்டு' நிலை…" },
      a: {
        en: ["The center line", "The left edge, ridden defensively", "The opposite lane", "The pavement"],
        si: ["මැද ඉර", "ආරක්ෂාකාරීව යන වම් කෙළවර", "අනිත් මංතීරුව", "පාදම"],
        ta: ["மையக் கோடு", "பாதுகாப்பாகச் செல்லும் இடது விளிம்பு", "எதிர் பாதை", "நடைபாதை"],
      },
      correct: 1,
    },
    {
      q: { en: "You must never overtake…", si: "Overtake නොකළ යුත්තේ…", ta: "ஒருபோதும் முந்தக் கூடாத இடம்…" },
      a: {
        en: ["On a straight empty road", "On bends, crests, junctions or crossings", "In daylight", "When the vehicle ahead signals left"],
        si: ["හිස් කෙළින් මාර්ගයක", "වංගු, මුදුන්, මංසන්ධි හෝ මාරුවලදී", "දිවා කාලයේ", "ඉදිරියේ වාහනය වමට signal දුන් විට"],
        ta: ["வெற்று நேர் சாலையில்", "வளைவுகள், உச்சிகள், சந்திப்புகள் அல்லது கடப்புகளில்", "பகலில்", "முன்னால் வாகனம் இடதுபுறம் சிக்னல் கொடுத்தால்"],
      },
      correct: 1,
    },
    {
      q: { en: "Stopping inside a roundabout to check your route is…", si: "මාර්ගය බැලීමට රවුම් සන්ධියක් ඇතුළත නැවැත්වීම…", ta: "வழி பார்க்க வட்டவழிக்குள் நிற்பது…" },
      a: {
        en: ["Allowed for bikes", "Dangerous and forbidden", "Fine if you signal", "Required by law"],
        si: ["බයික් සඳහා අවසරයි", "අනතුරුදායකයි, තහනම්", "signal දුන්නොත් හොඳයි", "නීතියෙන් අවශ්‍යයි"],
        ta: ["பைக்குகளுக்கு அனுமதி", "ஆபத்தானது, தடை", "சிக்னல் கொடுத்தால் பரவாயில்லை", "சட்டப்படி தேவை"],
      },
      correct: 1,
    },
  ],
};
