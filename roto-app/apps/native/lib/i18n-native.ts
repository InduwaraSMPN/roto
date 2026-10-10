// Native-only string keys — screens/flows that don't exist on the web app yet (drawer home,
// Ride/Rides tab chrome, sign-in/up, SOS contacts screen, voice-download prompt). These merge
// with @roto-app/core/i18n's shared dictionary in contexts/lang-context.tsx. A key that turns
// out to be needed by the web app too should move to packages/core/src/i18n instead — core is
// owned by stream A, not this one, so it stays here until that move happens (see the Phase 0
// stream D final report for the list of keys that look like core candidates).
// ponytail: si/ta by non-native speaker — get a native speaker to review before store release
// (same gate as packages/core/src/i18n and the original apps/native/lib/i18n.ts).

export const en = {
  // Drawer home (app/(drawer)/index.tsx)
  heroTagline: "Free offline-first rides for Sri Lanka — no subscription, no tracking.",
  welcomeBack: "Welcome back, {name}",
  planARide: "Plan a ride",
  signOut: "Sign Out",
  planARideNoAccount: "Plan a ride — no account needed",
  provenRoutes: "Proven LK routes",
  loadingRoutes: "Loading routes…",
  routesUnavailable: "Routes are unavailable. Open the Ride tab and draw a 60 km loop.",
  ridingThisMonth: "Riding this month",
  targetKm: "Target 500 km",
  checkingPack: "Checking the pack…",
  noRidesTakeSpot: "No rides logged yet — record a ride and take the top spot.",
  serviceStatus: "Service status",
  liveStatus: "LIVE",
  offlineStatus: "OFFLINE",
  rotoApi: "Roto API",
  checkingConnection: "Checking connection…",
  connectedLive: "Connected — routes and community are live",
  offlineStillWorks: "Offline — offline packs and recording still work",

  // Ride/Rides tab chrome
  startHere: "Start here",
  startHereSub:
    "The Ride tab plans and records. The Rides tab holds challenges, group rides, and privacy zones.",
  readyToRide: "Ready to ride?",
  readyToRideSub: "Plan a curvy loop, download the offline pack, then hit START RIDE.",
  openRideTab: "Open the Ride tab",
  groupRidesSub: "RSVP to join the pack — codes are shared on the Ride tab.",
  loadingGroupRides: "Loading group rides…",
  loadingZones: "Loading privacy zones…",

  // Sign-in / sign-up (components/sign-in.tsx, sign-up.tsx)
  signInTitle: "Sign In",
  createAccountTitle: "Create Account",
  emailLabel: "Email",
  passwordLabel: "Password",
  nameLabel: "Name",
  signInFailed: "Failed to sign in",
  signInSuccess: "Signed in successfully",
  signUpFailed: "Failed to sign up",
  signUpSuccess: "Account created successfully",
  // Auth validation + placeholders. lib/auth-schemas.ts sits at module scope (stable identity for
  // @tanstack/react-form), so it cannot close over `t` — it emits these ids as messages and the
  // screens translate them via `isAuthMessageId`. Anything else is a server message, passed through.
  emailRequired: "Email is required",
  emailInvalid: "Enter a valid email address",
  passwordRequired: "Password is required",
  passwordMin: "Use at least 8 characters",
  nameRequired: "Name is required",
  nameMin: "Name must be at least 2 characters",
  emailPlaceholder: "email@example.com",
  namePlaceholder: "John Doe",

  // Ride tab: shuffle, group leave, SOS contacts line, voice download prompt
  shuffle: "Shuffle",
  leaveGroup: "Leave",
  sosContactsCount: "{count} SOS contacts",
  sosContactsLink: "Manage SOS contacts",
  sosSmsText: "Roto SOS: I need help. My last location: {url}",
  voiceDownloadTitle: "Download {lang} voice?",
  voiceDownloadBody:
    "Your phone has no {lang} voice installed. Turns will be spoken in English until you add one in system settings.",
  voiceDownloadOpenSettings: "Open settings",
  voiceDownloadDismiss: "Not now",

  // SOS contacts screen (app/(drawer)/safety.tsx)
  sosContacts: "SOS contacts",
  sosContactsSub:
    "Alerted on a crash or manual SOS. Saved on this phone even when signed out, so SOS still works offline.",
  addContact: "Add contact",
  editContact: "Edit contact",
  nameField: "Name",
  phoneField: "Phone",
  phoneHint: "07X XXX XXXX",
  relationField: "Relation",
  relationHint: "e.g. Spouse, Parent, Friend",
  languageField: "Language",
  emailFieldOptional: "Email (optional)",
  save: "Save",
  cancel: "Cancel",
  noContactsYet: "No SOS contacts yet — add someone who should know if you crash.",
  contactSaved: "Contact saved",
  contactRemoved: "Contact removed",
  contactFailed: "Could not save that contact",
  signInToSyncContacts:
    "Sign in to sync contacts across devices. Contacts saved here still work for manual SOS while signed out.",
  offlineContactsNote: "Offline — showing contacts saved on this phone.",

  // SOS countdown overlay (components/safety/sos-countdown.tsx)
  sosCountdownTitle: "Crash suspected",
  sosCountdownManualTitle: "SOS",
  sosCountdownBody: "Alerting your SOS contacts soon.",
  sosCountdownPreviewBody: "Preview — no alerts will be sent.",
  sosSlideToCancel: "Slide to cancel",
  sosImOk: "I'm OK",
  sosSendNow: "Send now",
  sosCountdownVoice: "SOS countdown. Slide to cancel if you are okay.",

  // Navigation curve warnings (lib/use-navigation.ts)
  navCurveAhead: "Sharp {dir} bend in {dist}",
  navDirLeft: "left",
  navDirRight: "right",

  // Ride tab tools (app/(drawer)/(tabs)/map.tsx)
  autoPause: "Auto-pause",
  saverAuto: "Battery low — saver on",

  // SOS contacts screen extras (app/(drawer)/safety.tsx)
  crashSensitivity: "Crash sensitivity",
  testCountdown: "Test countdown",
  testSms: "Send test SMS",
  testSmsSent: "Test SMS opened",
  testSmsFailed: "Could not open the SMS composer",
  noContactsForTest: "Add an SOS contact first.",

  // Local DB migration gate (app/_layout.tsx)
  dbMigrating: "Setting up local storage…",
  dbMigrationError: "Local database failed to start",

  // Live group badge (app/(drawer)/(tabs)/map.tsx) — "LIVE" stays as-is, like liveStatus.
  liveGroupBadge: "LIVE {code} ({count})",

  // Accessibility labels for icon-only controls
  moveUp: "Move up",
  moveDown: "Move down",
  sections: "Sections",

  // Not-found screen (app/+not-found.tsx)
  notFoundTitle: "Not Found",
  pageNotFound: "Page Not Found",
  pageNotFoundBody: "The page you're looking for doesn't exist.",
  goHome: "Go Home",
};

export type NativeStrings = typeof en;

const si: NativeStrings = {
  heroTagline: "ශ්‍රී ලංකාවේ නොමිලේ, offline-first ගමන් — subscription නැත, trace කිරීමක් නැත.",
  welcomeBack: "ආයුබෝවන්, {name}",
  planARide: "ගමනක් සැලසුම් කරන්න",
  signOut: "ලොග් අවුට් වන්න",
  planARideNoAccount: "ගමනක් සැලසුම් කරන්න — ගිණුමක් අවශ්‍ය නැත",
  provenRoutes: "ලා. ක. ප්‍රසිද්ධ මාර්ග",
  loadingRoutes: "මාර්ග පූරණය වෙමින්…",
  routesUnavailable: "මාර්ග ලබා ගත නොහැක. Ride tab එකෙන් km 60ක Loop එකක් අඳින්න.",
  ridingThisMonth: "මේ මාසයේ ධාවනය",
  targetKm: "ඉලක්කය km 500",
  checkingPack: "පරීක්ෂා කරමින්…",
  noRidesTakeSpot: "තවම ගමන් නැත — ගමනක් වාර්තා කර පළමු තැන ගන්න.",
  serviceStatus: "සේවා තත්ත්වය",
  liveStatus: "LIVE",
  offlineStatus: "OFFLINE",
  rotoApi: "Roto API",
  checkingConnection: "සම්බන්ධතාව පරීක්ෂා කරමින්…",
  connectedLive: "සම්බන්ධයි — මාර්ග සහ ප්‍රජාව සජීවීයි",
  offlineStillWorks: "Offline — offline packs සහ පටිගත කිරීම තවමත් ක්‍රියාත්මකයි",

  startHere: "මෙතැනින් ආරම්භ කරන්න",
  startHereSub:
    "Ride tab එක සැලසුම් කර පටිගත කරයි. Rides tab එකේ අභියෝග, කණ්ඩායම් ගමන් සහ පෞද්ගලික කලාප ඇත.",
  readyToRide: "ධාවනයට සූදානම්ද?",
  readyToRideSub: "වක්‍ර loop එකක් සැලසුම් කර, offline pack බාගෙන, START RIDE ඔබන්න.",
  openRideTab: "Ride tab විවෘත කරන්න",
  groupRidesSub: "පැකේජයට එකතු වීමට RSVP කරන්න — කේත Ride tab හි බෙදාගනී.",
  loadingGroupRides: "කණ්ඩායම් ගමන් පූරණය වෙමින්…",
  loadingZones: "පෞද්ගලික කලාප පූරණය වෙමින්…",

  signInTitle: "ලොග් වන්න",
  createAccountTitle: "ගිණුමක් සාදන්න",
  emailLabel: "විද්‍යුත් තැපෑල",
  passwordLabel: "මුරපදය",
  nameLabel: "නම",
  signInFailed: "ලොග් වීම අසාර්ථකයි",
  signInSuccess: "සාර්ථකව ලොග් විය",
  signUpFailed: "ගිණුම සෑදීම අසාර්ථකයි",
  signUpSuccess: "ගිණුම සාර්ථකව සෑදිණි",
  emailRequired: "විද්‍යුත් තැපෑල අවශ්‍යයි",
  emailInvalid: "වලංගු විද්‍යුත් තැපැල් ලිපිනයක් ඇතුළත් කරන්න",
  passwordRequired: "මුරපදය අවශ්‍යයි",
  passwordMin: "අවම වශයෙන් අක්ෂර 8ක් භාවිතා කරන්න",
  nameRequired: "නම අවශ්‍යයි",
  nameMin: "නම අවම වශයෙන් අක්ෂර 2ක් විය යුතුය",
  emailPlaceholder: "email@example.com",
  namePlaceholder: "කමල් පෙරේරා",

  shuffle: "මාරු කරන්න",
  leaveGroup: "ඉවත් වන්න",
  sosContactsCount: "SOS සම්බන්ධතා {count}",
  sosContactsLink: "SOS සම්බන්ධතා කළමනාකරණය",
  sosSmsText: "Roto SOS: උදව් අවශ්‍යයි. මගේ අවසන් ස්ථානය: {url}",
  voiceDownloadTitle: "{lang} හඬ බාගන්නද?",
  voiceDownloadBody: "ඔබේ දුරකථනයේ {lang} හඬක් නැත. එය සකසන තෙක් හැරීම් ඉංග්‍රීසියෙන් කියවනු ලැබේ.",
  voiceDownloadOpenSettings: "සැකසුම් විවෘත කරන්න",
  voiceDownloadDismiss: "දැන් නොවේ",

  sosContacts: "SOS සම්බන්ධතා",
  sosContactsSub:
    "අනතුරකදී හෝ SOS එබූ විට දැනුම් දෙනු ලැබේ. ලොග් අවුට් වූ විටත් මෙම දුරකථනයේ සුරැකේ.",  addContact: "සම්බන්ධතාවක් එකතු කරන්න",
  editContact: "සම්බන්ධතාව සංස්කරණය",
  nameField: "නම",
  phoneField: "දුරකථන අංකය",
  phoneHint: "07X XXX XXXX",
  relationField: "සම්බන්ධතාවය",
  relationHint: "උදා: කලත්‍රයා, දෙමාපියෙක්, මිතුරෙක්",
  languageField: "භාෂාව",
  emailFieldOptional: "විද්‍යුත් තැපෑල (විකල්ප)",
  save: "සුරකින්න",
  cancel: "අවලංගු කරන්න",
  noContactsYet: "තවම SOS සම්බන්ධතා නැත — අනතුරක් වූ විට දැනුවත් කළ යුත්තෙකු එකතු කරන්න.",
  contactSaved: "සම්බන්ධතාව සුරැකිණි",
  contactRemoved: "සම්බන්ධතාව ඉවත් කරන ලදී",
  contactFailed: "එම සම්බන්ධතාව සුරැකිය නොහැකි විය",
  signInToSyncContacts:
    "උපාංග අතර සමමුහුර්ත කිරීමට ලොග් වන්න. ලොග් අවුට් වූ විටත් මෙහි සුරැකි සම්බන්ධතා SOS සඳහා ක්‍රියා කරයි.",
  offlineContactsNote: "Offline — මෙම දුරකථනයේ සුරැකි සම්බන්ධතා පෙන්වයි.",

  sosCountdownTitle: "අනතුරක් සැක කෙරේ",
  sosCountdownManualTitle: "SOS",
  sosCountdownBody: "ඉක්මනින් ඔබේ SOS සම්බන්ධතාවලට දැනුම් දෙනු ලැබේ.",
  sosCountdownPreviewBody: "පෙරදසුන — අනතුරු ඇඟවීම් යවනු නොලැබේ.",
  sosSlideToCancel: "අවලංගු කිරීමට ලිස්සන්න",
  sosImOk: "මම හොඳින්",
  sosSendNow: "දැන් යවන්න",
  sosCountdownVoice: "SOS ගණන් කිරීම. ඔබ හොඳින් නම් අවලංගු කිරීමට ලිස්සන්න.",

  navCurveAhead: "මීටර් {dist}කින් තියුනු {dir} වංගුවක්",
  navDirLeft: "වම්",
  navDirRight: "දකුණු",

  autoPause: "ස්වයංක්‍රීය නැවැත්වීම",
  saverAuto: "බැටරිය අඩුයි — saver ක්‍රියාත්මකයි",

  crashSensitivity: "අනතුරු සංවේදීතාව",
  testCountdown: "ගණන් කිරීම පරීක්ෂා කරන්න",
  testSms: "පරීක්ෂණ SMS යවන්න",
  testSmsSent: "පරීක්ෂණ SMS විවෘත විය",
  testSmsFailed: "SMS composor එක විවෘත කළ නොහැකි විය",
  noContactsForTest: "පළමුව SOS සම්බන්ධතාවක් එකතු කරන්න.",

  dbMigrating: "දේශීය ගබඩාව සකසමින්…",
  dbMigrationError: "දේශීය දත්ත ගබඩාව ආරම්භ වීමට අසමත් විය",

  liveGroupBadge: "LIVE {code} ({count})",
  moveUp: "ඉහළට ගෙනයන්න",
  moveDown: "පහළට ගෙනයන්න",
  sections: "කොටස්",

  notFoundTitle: "හමු නොවිණි",
  pageNotFound: "පිටුව හමු නොවිණි",
  pageNotFoundBody: "ඔබ සොයන පිටුව නොපවතී.",
  goHome: "මුල් පිටුවට",
};

const ta: NativeStrings = {
  heroTagline: "இலங்கைக்கான இலவச, ஆஃப்லைன்-முதல் பயணங்கள் — சந்தா இல்லை, கண்காணிப்பு இல்லை.",
  welcomeBack: "மீண்டும் வருக, {name}",
  planARide: "பயணத்தைத் திட்டமிடு",
  signOut: "வெளியேறு",
  planARideNoAccount: "பயணத்தைத் திட்டமிடு — கணக்கு தேவையில்லை",
  provenRoutes: "நிரூபிக்கப்பட்ட இலங்கை வழிகள்",
  loadingRoutes: "வழிகள் ஏற்றப்படுகின்றன…",
  routesUnavailable: "வழிகள் கிடைக்கவில்லை. Ride tab-இல் 60 கி.மீ Loop ஒன்றை வரையவும்.",
  ridingThisMonth: "இந்த மாத ஓட்டம்",
  targetKm: "இலக்கு 500 கி.மீ",
  checkingPack: "சரிபார்க்கிறது…",
  noRidesTakeSpot: "இன்னும் பயணங்கள் இல்லை — ஒரு பயணத்தைப் பதிவு செய்து முதலிடத்தை எடு.",
  serviceStatus: "சேவை நிலை",
  liveStatus: "LIVE",
  offlineStatus: "OFFLINE",
  rotoApi: "Roto API",
  checkingConnection: "இணைப்பைச் சரிபார்க்கிறது…",
  connectedLive: "இணைக்கப்பட்டுள்ளது — வழிகளும் சமூகமும் நேரடியில்",
  offlineStillWorks: "ஆஃப்லைன் — ஆஃப்லைன் பொதிகளும் பதிவும் இன்னும் வேலை செய்கின்றன",

  startHere: "இங்கிருந்து தொடங்கவும்",
  startHereSub:
    "Ride tab திட்டமிட்டு பதிவு செய்கிறது. Rides tab-இல் சவால்கள், குழு பயணங்கள், தனியுரிமை மண்டலங்கள் உள்ளன.",
  readyToRide: "ஓட்டத்திற்குத் தயாரா?",
  readyToRideSub: "வளைவான loop ஒன்றைத் திட்டமிட்டு, ஆஃப்லைன் பொதியைப் பதிவிறக்கி, START RIDE அழுத்தவும்.",
  openRideTab: "Ride tab-ஐத் திற",
  groupRidesSub: "குழுவில் இணைய RSVP செய்யவும் — குறியீடுகள் Ride tab-இல் பகிரப்படும்.",
  loadingGroupRides: "குழு பயணங்கள் ஏற்றப்படுகின்றன…",
  loadingZones: "தனியுரிமை மண்டலங்கள் ஏற்றப்படுகின்றன…",

  signInTitle: "உள்நுழை",
  createAccountTitle: "கணக்கை உருவாக்கு",
  emailLabel: "மின்னஞ்சல்",
  passwordLabel: "கடவுச்சொல்",
  nameLabel: "பெயர்",
  signInFailed: "உள்நுழைய முடியவில்லை",
  signInSuccess: "வெற்றிகரமாக உள்நுழைந்தீர்கள்",
  signUpFailed: "கணக்கை உருவாக்க முடியவில்லை",
  signUpSuccess: "கணக்கு வெற்றிகரமாக உருவாக்கப்பட்டது",
  emailRequired: "மின்னஞ்சல் தேவை",
  emailInvalid: "சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்",
  passwordRequired: "கடவுச்சொல் தேவை",
  passwordMin: "குறைந்தது 8 எழுத்துகளைப் பயன்படுத்தவும்",
  nameRequired: "பெயர் தேவை",
  nameMin: "பெயர் குறைந்தது 2 எழுத்துகள் இருக்க வேண்டும்",
  emailPlaceholder: "email@example.com",
  namePlaceholder: "கமல் பெரேரா",

  shuffle: "மாற்று",
  leaveGroup: "வெளியேறு",
  sosContactsCount: "SOS தொடர்புகள் {count}",
  sosContactsLink: "SOS தொடர்புகளை நிர்வகி",
  sosSmsText: "Roto SOS: உதவி தேவை. என் கடைசி இடம்: {url}",
  voiceDownloadTitle: "{lang} குரலைப் பதிவிறக்கவா?",
  voiceDownloadBody:
    "உங்கள் தொலைபேசியில் {lang} குரல் இல்லை. நீங்கள் சேர்க்கும் வரை திருப்பங்கள் ஆங்கிலத்தில் பேசப்படும்.",
  voiceDownloadOpenSettings: "அமைப்புகளைத் திற",
  voiceDownloadDismiss: "இப்போது வேண்டாம்",

  sosContacts: "SOS தொடர்புகள்",
  sosContactsSub:
    "விபத்து அல்லது கைமுறை SOS-இல் அறிவிக்கப்படுவார்கள். வெளியேறியிருந்தாலும் இந்தத் தொலைபேசியில் சேமிக்கப்படும்.",
  addContact: "தொடர்பைச் சேர்",
  editContact: "தொடர்பைத் திருத்து",
  nameField: "பெயர்",
  phoneField: "தொலைபேசி",
  phoneHint: "07X XXX XXXX",
  relationField: "உறவு",
  relationHint: "எ.கா. வாழ்க்கைத் துணை, பெற்றோர், நண்பர்",
  languageField: "மொழி",
  emailFieldOptional: "மின்னஞ்சல் (விருப்பம்)",
  save: "சேமி",
  cancel: "ரத்துசெய்",
  noContactsYet: "இன்னும் SOS தொடர்புகள் இல்லை — விபத்தின்போது அறிய வேண்டியவரைச் சேர்க்கவும்.",
  contactSaved: "தொடர்பு சேமிக்கப்பட்டது",
  contactRemoved: "தொடர்பு நீக்கப்பட்டது",
  contactFailed: "அந்தத் தொடர்பைச் சேமிக்க முடியவில்லை",
  signInToSyncContacts:
    "சாதனங்களில் ஒத்திசைக்க உள்நுழையவும். வெளியேறியிருந்தாலும் இங்கு சேமித்த தொடர்புகள் SOS-க்குச் செயல்படும்.",
  offlineContactsNote: "ஆஃப்லைன் — இந்தத் தொலைபேசியில் சேமித்த தொடர்புகளைக் காட்டுகிறது.",

  sosCountdownTitle: "விபத்து சந்தேகம்",
  sosCountdownManualTitle: "SOS",
  sosCountdownBody: "விரைவில் உங்கள் SOS தொடர்புகளுக்கு அறிவிக்கப்படும்.",
  sosCountdownPreviewBody: "முன்னோட்டம் — எச்சரிக்கைகள் அனுப்பப்படாது.",
  sosSlideToCancel: "ரத்துசெய்ய இழுக்கவும்",
  sosImOk: "நான் நலம்",
  sosSendNow: "இப்போது அனுப்பு",
  sosCountdownVoice: "SOS எண்ணிக்கை. நீங்கள் நலமாக இருந்தால் ரத்துசெய்ய இழுக்கவும்.",

  navCurveAhead: "{dist} மீட்டரில் கூர்மையான {dir} வளைவு",
  navDirLeft: "இடது",
  navDirRight: "வலது",

  autoPause: "தானியங்கு இடைநிறுத்தம்",
  saverAuto: "பேட்டரி குறைவு — சேமிப்பான் இயக்கத்தில்",

  crashSensitivity: "விபத்து உணர்திறன்",
  testCountdown: "எண்ணிக்கையைச் சோதி",
  testSms: "சோதனை SMS அனுப்பு",
  testSmsSent: "சோதனை SMS திறக்கப்பட்டது",
  testSmsFailed: "SMS திரையைத் திறக்க முடியவில்லை",
  noContactsForTest: "முதலில் SOS தொடர்பைச் சேர்க்கவும்.",

  dbMigrating: "உள்ளக சேமிப்பகத்தை அமைக்கிறது…",
  dbMigrationError: "உள்ளக தரவுத்தளம் தொடங்கத் தவறியது",

  liveGroupBadge: "LIVE {code} ({count})",
  moveUp: "மேலே நகர்த்து",
  moveDown: "கீழே நகர்த்து",
  sections: "பிரிவுகள்",

  notFoundTitle: "கண்டுபிடிக்கப்படவில்லை",
  pageNotFound: "பக்கம் கண்டுபிடிக்கப்படவில்லை",
  pageNotFoundBody: "நீங்கள் தேடும் பக்கம் இல்லை.",
  goHome: "முகப்புக்குச் செல்",
};

export const NATIVE_STR: Record<"en" | "si" | "ta", NativeStrings> = { en, si, ta };
