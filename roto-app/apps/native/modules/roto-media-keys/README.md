# roto-media-keys

Local Expo native module (**Android only**, decision D15 -- no iOS/Swift) that
bridges handlebar/headset Bluetooth remote buttons to Roto through an Android
`MediaSessionCompat`, with long-press detection and debounce.

Scope owned by this module: everything under
`apps/native/modules/roto-media-keys/**`. It does not touch `app.json`,
`package.json`, or any app screen -- wiring it in is a separate, explicit
integration step (below) for whoever owns those files.

## Changelog

- **2026-09-28** No code change in this module. It is now linked and wired:
  `apps/native/package.json` lists `roto-media-keys`, `app.json` registers
  `app.plugin.js`, and `lib/use-navigation.ts` brackets `start()`/`stop()`
  around a navigation session and maps `play_pause` (short) to repeat,
  `play_pause` (long) to the SOS countdown, `next` to the hazard sheet and
  `previous` to the HUD toggle. The same commit added the Android Auto map
  surface in `modules/roto-car/` (see its README), which changed nothing about
  the key mapping or the audio-focus workaround documented below.

## Why a MediaSession at all

Android has no public API to "listen for a Bluetooth remote's buttons"
directly. The only supported path is registering a media session
(`MediaSessionCompat`, or the platform `android.media.session.MediaSession`)
and receiving `KEYCODE_MEDIA_*` / `KEYCODE_HEADSETHOOK` / `KEYCODE_VOLUME_*`
key events through its callback, exactly as a music app would. Roto has no
real audio to play, so it borrows that plumbing without a player -- see
"Limitations" for what that costs.

## Intended key mapping (from the feature-parity plan, §4.18)

| Button | Short press | Long press (>= 800ms) |
|---|---|---|
| Play/pause (or headset hook) | Repeat the last spoken turn-by-turn instruction | Start the manual SOS countdown (still cancellable, same flow as the in-app SOS button) |
| Next | Open the hazard-report sheet | -- |
| Previous | Toggle the navigation HUD | -- |
| Volume up / down | Reserved for a future use (e.g. nudge voice volume); not wired to anything yet | -- |

This module only emits normalized `key` events (`play_pause`, `next`,
`previous`, `volume_up`, `volume_down`) with a `longPress` flag. It has no
opinion on what those mean -- wiring the mapping above into the ride screen
(`apps/native/app/(drawer)/(tabs)/map.tsx` / `lib/use-navigation.ts` per the
plan) is the app's job, not this module's.

## Public API (`index.ts`)

```ts
import RotoMediaKeys, { isAvailable, start, stop, addKeyListener } from 'roto-media-keys';

isAvailable(): boolean;
// true only on a rebuilt Android dev/prod build with this module linked.
// Always false on iOS, web, Expo Go, or a dev client built before this
// module was added to app.json (see "Integration steps").

start(): Promise<void>;
// Starts the MediaSession for the current ride/navigation session. Safe to
// call repeatedly and safe to call when unavailable (no-op).

stop(): Promise<void>;
// Stops the session and releases the silent keep-alive audio focus
// (see "Limitations"). Call this when navigation ends -- the session is not
// meant to outlive a ride.

addKeyListener(listener: (event: { key, longPress }) => void): EventSubscription;
// event.key: 'play_pause' | 'next' | 'previous' | 'volume_up' | 'volume_down'
// event.longPress: boolean
// Always returns a Subscription with .remove(), even when unavailable, so a
// useEffect cleanup never needs an isAvailable() branch.
```

Every exported function is wrapped so a missing/failed native module can
never throw into the ride screen -- worst case, `isAvailable()` is `false`
and the rest are no-ops.

## Android implementation

- `RotoMediaKeysModule.kt` -- the Expo module. `start()` creates one
  `MediaSessionCompat`, sets a `PlaybackStateCompat` of `STATE_PLAYING` (see
  "Limitations" for why), sets it active, and registers a callback that maps
  `KeyEvent`s to `MediaKey`s, applies long-press detection (an 800ms
  `Handler.postDelayed` armed on the first `ACTION_DOWN`, cancelled on
  `ACTION_UP`) and a 250ms debounce per `(key, longPress)` pair (guards
  against bouncy Bluetooth connections re-delivering the same press). `stop()`
  tears all of that down. Log tag: **`RotoMediaKeys`**.
- `SilentAudioFocusPlayer.kt` -- see "Limitations" below. Requests
  `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` (not a full, exclusive `GAIN`, so it
  doesn't stop the rider's actual music/podcast) and streams a literal
  all-zero PCM buffer through `AudioTrack` for as long as the session is
  running.
- No `AndroidManifest.xml` entries, no custom permission, no declared
  `Service`. See `plugin/with-roto-media-keys.js` for the full reasoning --
  the plugin is a documented no-op.
- `android/build.gradle` mirrors the modern `expo-module-gradle-plugin`
  style used by `expo-location`/`expo-sensors` in this SDK (namespace +
  `defaultConfig` only; no explicit `compileSdkVersion` -- the plugin
  supplies it). One dependency: `androidx.media:media:1.7.0`, which is where
  `android.support.v4.media.session.MediaSessionCompat` /
  `PlaybackStateCompat` live (that package name is kept for source
  compatibility even though the artifact is AndroidX).

## Limitations (read before assuming this "just works")

**1. An active-but-silent session is not guaranteed to receive hardware
button events, even with `setActive(true)` and a `PlaybackState`.** Android's
media-button routing picks whichever `MediaSession` currently has the
highest priority, and that ranking is driven by real playback/audio-focus
state, not merely by a session being `active`
([`MediaSession.Callback` docs](https://developer.android.com/reference/android/media/session/MediaSession.Callback);
multiple confirmed reports of exactly this failure mode, e.g.
[here](https://stackoverflow.com/questions/58471964/catching-android-media-button-events)
and
[here](https://stackoverflow.com/questions/41795637/app-does-not-become-the-preferred-mediabuttonreceiver-when-calling-setactivetru)).
The documented, empirically-confirmed workaround is to request audio focus
and actually produce audio output -- which is why `SilentAudioFocusPlayer`
exists. Even with it, **a device actually playing real audio at the exact
moment of the button press keeps priority.** If the rider has Spotify,
Samsung Music, a podcast app, or similar actively playing, their remote's
buttons may still go there instead of Roto, particularly right after a
Bluetooth route change. This module improves the odds; it does not make the
outcome certain, and that has not been verified across every OEM's audio
stack (Samsung One UI, in particular, runs its own media agents that are
known to compete for session priority).
- We deliberately used `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` with
  `setWillPauseWhenDucked(false)` rather than a permanent `AUDIOFOCUS_GAIN`,
  so starting navigation does not forcibly pause the rider's own music. The
  trade-off is a (silent, so ideally inaudible) audio "duck" of other apps
  while riding.

**2. Volume buttons are best-effort and frequently will not reach this
module at all.** On most devices, `KEYCODE_VOLUME_UP`/`KEYCODE_VOLUME_DOWN`
are consumed directly by the Android audio framework as stream-volume
changes *before* (or instead of) ever being delivered to a
`MediaSessionCompat.Callback.onMediaButtonEvent`. Some Bluetooth remotes send
AVRCP absolute/relative volume commands that never surface as a `KeyEvent`
to any app in the first place. `volume_up`/`volume_down` are mapped here for
the remotes/ROMs that do forward them, but do not build a feature that
assumes they reliably arrive -- confirm on the target remote with the `adb`
test below before relying on it.

**3. Long-press detection needs a genuine key-up.** The 800ms timer is armed
on the first `ACTION_DOWN` and fires only if no `ACTION_UP` for that keycode
arrives first. A remote (or ROM) that only ever sends a single, undifferentiated
"click" event with no distinguishable down/up pair will only ever produce
short presses from this module -- there is no long-press signal to detect in
that case. This matches real hardware variance across cheap handlebar
remotes and is not something software can paper over.

**4. The session only exists while the app process is alive, on purpose --
and needs the process to stay alive.** `start()`/`stop()` are meant to bracket
an active ride/navigation session, which is expected to already be running
inside the location foreground service used by ride recording (see
`apps/native/lib/ride-recorder.ts`, and the `roto-safety` module). If
`start()` is ever called with no such foreground service active (screen off,
no ride/nav running), Android's Doze/App Standby background restrictions may
throttle or kill the silent `AudioTrack` thread and/or the whole process,
and there is no manifest-registered `MediaButtonReceiver` to relaunch it from
a Bluetooth press (see `plugin/with-roto-media-keys.js` for why that was left
out, and what adding it later would look like). **Practical rule: only call
`start()` while a ride or turn-by-turn navigation session -- and therefore
the location foreground service -- is already running.**

**5. No iOS implementation (D15).** On iOS, `isAvailable()` is always
`false` and every other call is a no-op. If handlebar remote support is ever
wanted on iOS, it would use `MPRemoteCommandCenter` (no `MediaSession`
equivalent needed there -- iOS routes remote-control events to whichever app
has an active `AVAudioSession` in a compatible category, which carries a
similar "needs real-ish audio" caveat).

## Integration steps (for whoever owns `app.json`/`package.json`/the ride screen)

This module was built read-only with respect to everything outside
`apps/native/modules/roto-media-keys/**`, per its task scope. To actually
link and use it:

1. **Add it as a workspace dependency.** In `apps/native/package.json`,
   add `"roto-media-keys": "./modules/roto-media-keys"` to `dependencies`,
   then run `npm install` from `roto-app/` (this repo requires
   `node scripts/patch-varlock-windows.mjs` after every install on Windows).
   This is what makes Expo's autolinking discover the module (it scans
   `node_modules`, which the `file:`-style link resolves into) and what lets
   `index.ts` resolve `expo-modules-core`/`react-native` from inside the
   module folder.
2. **Register the config plugin.** Add `"roto-media-keys"` to the `plugins`
   array in `apps/native/app.json` (it resolves `app.plugin.js`
   automatically once step 1 makes it a real dependency). It is a documented
   no-op today -- see `plugin/with-roto-media-keys.js` -- but keeping it
   registered means any future manifest need (e.g. the `MediaButtonReceiver`
   discussed in "Limitations" #4) ships without another wiring step.
3. **Rebuild the dev client.** This is a native module; Expo Go cannot load
   it. From `apps/native`: `npx expo prebuild` (or let step 4's `run:android`
   trigger it) then `npx expo run:android`.
4. **Call it from the navigation lifecycle**, per the plan (§4.18, via
   `apps/native/lib/use-navigation.ts` or wherever turn-by-turn navigation
   starts/stops):
   ```ts
   import RotoMediaKeys from 'roto-media-keys';

   useEffect(() => {
     if (!isNavigating) return;
     RotoMediaKeys.start();
     const sub = RotoMediaKeys.addKeyListener(({ key, longPress }) => {
       switch (key) {
         case 'play_pause':
           longPress ? startSosCountdown() : repeatLastInstruction();
           break;
         case 'next':
           openHazardSheet();
           break;
         case 'previous':
           toggleHud();
           break;
         // volume_up / volume_down: best-effort, see README "Limitations"
       }
     });
     return () => {
       sub.remove();
       RotoMediaKeys.stop();
     };
   }, [isNavigating]);
   ```
   Only start the session while navigation (and therefore the location
   foreground service) is already active -- see "Limitations" #4.

## Test steps

**Without hardware**, using `adb` to simulate the same key events a
Bluetooth remote sends (works once the module is linked and the app is in
the foreground with a navigation/ride session running so `start()` has been
called):

```powershell
adb shell input keyevent 85   # KEYCODE_MEDIA_PLAY_PAUSE -> short press: "play_pause"
adb shell input keyevent 87   # KEYCODE_MEDIA_NEXT       -> "next"
adb shell input keyevent 88   # KEYCODE_MEDIA_PREVIOUS   -> "previous"
adb shell input keyevent 24   # KEYCODE_VOLUME_UP        -> best-effort, see Limitations #2
adb shell input keyevent 25   # KEYCODE_VOLUME_DOWN      -> best-effort, see Limitations #2
adb logcat -s RotoMediaKeys   # watch "session started", "key=... longPress=...", debounce logs
```

`adb shell input keyevent` sends a single down+up pair, so it will not
exercise the long-press timer by itself; to test long-press, use `--longpress`
if the installed `adb`/platform-tools version supports it
(`adb shell input keyevent --longpress 85`), or press and hold the button on
a real remote.

**With a real Bluetooth handlebar remote or headset:**
1. Pair the remote to the test phone as a normal Bluetooth audio/HID device.
2. Start a ride or navigation session in the Roto app (so `start()` has run)
   and confirm `adb logcat -s RotoMediaKeys` shows `session started`.
3. Press play/pause, next, and previous; confirm one `key=... longPress=false`
   log line per press, with no duplicates within 250ms.
4. Hold play/pause for over 800ms; confirm `key=play_pause longPress=true`
   fires once, from the timer, with no extra short-press event on release.
5. Try the volume buttons; per Limitations #2, treat "nothing logged" as an
   expected possible outcome on many phones, not a bug -- confirm by cross-
   checking whether the phone's own volume UI changed instead.
6. Lock the screen mid-ride (with navigation still running, so the location
   foreground service keeps the process alive) and repeat steps 3-4 to
   confirm the session survives screen-off.
7. Start some real audio (e.g. a podcast) on the phone, then press the
   remote's buttons; per Limitations #1, some presses may go to that app
   instead of Roto -- this is a documented, expected limitation, not
   something to "fix" by escalating the audio focus request.
