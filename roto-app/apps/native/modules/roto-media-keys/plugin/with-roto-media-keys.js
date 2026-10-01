/**
 * roto-media-keys config plugin.
 *
 * This is intentionally a no-op. `RotoMediaKeysModule` talks to Android's
 * media-session framework (MediaSessionCompat) entirely from inside the app's
 * already-running process, during a ride/navigation session that is already
 * keeping that process alive via the location foreground service used by
 * ride recording (see `apps/native/lib/ride-recorder.ts` and the
 * `roto-safety` module). That path needs none of the manifest work an Expo
 * config plugin would normally add:
 *
 *   - No custom permission. Creating a `MediaSessionCompat`, requesting audio
 *     focus, and streaming silence through `AudioTrack` need no manifest
 *     permission -- `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` are for
 *     recording and adjusting device audio *settings*, not for playing audio
 *     your own process generates.
 *   - No `<receiver>` for `android.support.v4.media.session.MediaButtonReceiver`.
 *     That manifest entry only matters if Android needs to relaunch a killed
 *     process from a Bluetooth button press (wired through
 *     `MediaSessionCompat#setMediaButtonReceiver(PendingIntent)`). Roto only
 *     starts the session while the app is already alive and navigating, so
 *     omitting it is a documented "not yet", not an oversight -- see
 *     README.md "Limitations".
 *   - No `foregroundServiceType="mediaPlayback"`. The module never starts its
 *     own `Service`; it plays its silent keep-alive tone from inside the
 *     existing process/activity, riding on the location foreground service
 *     that's already active during a recorded/navigated ride. Android 14's
 *     foreground-service media type enforcement applies to a `Service` that
 *     calls `startForeground()` for media playback, which this module never
 *     does.
 *
 * If a future change needs Roto to regain media-button routing after the app
 * process has been killed (e.g. a remote press while fully backgrounded with
 * no ride active), come back here and add the `MediaButtonReceiver` manifest
 * entry plus `PendingIntent` wiring described in README.md.
 */
const { createRunOncePlugin } = require('@expo/config-plugins');

const pkg = require('../package.json');

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withRotoMediaKeys = (config) => config;

module.exports = createRunOncePlugin(withRotoMediaKeys, pkg.name, pkg.version);
