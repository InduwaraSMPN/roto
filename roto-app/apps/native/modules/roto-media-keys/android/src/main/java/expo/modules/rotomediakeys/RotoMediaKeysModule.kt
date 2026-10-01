package expo.modules.rotomediakeys

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val TAG = "RotoMediaKeys"
private const val LONG_PRESS_MS = 800L
private const val DEBOUNCE_MS = 250L
private const val SESSION_TAG = "RotoMediaKeysSession"

/**
 * Bridges an Android [MediaSessionCompat] to JS so Roto can react to
 * handlebar/headset Bluetooth remote buttons (play/pause, next, previous,
 * volume) while riding. See ../../../../README.md for the intended key
 * mapping, integration steps, and -- important -- honest limitations: an
 * app with no real audio playback is not guaranteed to win hardware media
 * buttons over a real player, and hardware volume keys usually never reach
 * a MediaSession callback at all.
 *
 * Lifecycle: the session (and its silent keep-alive tone, see
 * [SilentAudioFocusPlayer]) exists only between [start] and [stop]. Callers
 * must stop it when navigation ends; it is not meant to run for the whole
 * app lifetime.
 */
class RotoMediaKeysModule : Module() {
  private var mediaSession: MediaSessionCompat? = null
  private var audioPlayer: SilentAudioFocusPlayer? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  // One pending long-press timer per Android keycode currently held down,
  // and whether that timer already fired (so key-up doesn't double-emit).
  private val pendingLongPress = mutableMapOf<Int, Runnable>()
  private val longPressFired = mutableMapOf<Int, Boolean>()

  // Debounce state, keyed by "<key>:<longPress>" so a genuine long-press
  // right after a short-press of the same key is never dropped.
  private val lastFireAt = mutableMapOf<String, Long>()

  override fun definition() =
    ModuleDefinition {
      Name("RotoMediaKeys")

      Events("onKey")

      OnDestroy {
        stopSession()
      }

      Function("isAvailable") {
        // Android only (D15). If this Kotlin code is running at all, the
        // module linked successfully -- there is no further hardware check,
        // since MediaSessionCompat is a software API present on every
        // Android version this app supports. The "unavailable" cases
        // (iOS, web, Expo Go, an un-rebuilt dev client) are handled in
        // index.ts before this native call is ever attempted.
        true
      }

      AsyncFunction("start") {
        startSession()
      }

      AsyncFunction("stop") {
        stopSession()
      }
    }

  private fun androidContext(): Context? = appContext.reactContext

  private fun startSession() {
    if (mediaSession != null) {
      Log.d(TAG, "start() called while already active; ignoring")
      return
    }
    val context =
      androidContext() ?: run {
        Log.w(TAG, "start() failed: no Android context available")
        return
      }

    val session =
      MediaSessionCompat(context, SESSION_TAG).apply {
        setCallback(
          object : MediaSessionCompat.Callback() {
            override fun onMediaButtonEvent(mediaButtonIntent: Intent): Boolean {
              return handleMediaButtonIntent(mediaButtonIntent)
            }
          },
        )
        // A PlaybackState of STATE_PLAYING (not just `isActive = true`) is
        // part of what Android's media-button routing looks at when
        // deciding which session currently has priority. See
        // SilentAudioFocusPlayer for the rest of that story.
        setPlaybackState(
          PlaybackStateCompat.Builder()
            .setActions(
              PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS,
            )
            .setState(
              PlaybackStateCompat.STATE_PLAYING,
              PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN,
              1f,
            )
            .build(),
        )
        isActive = true
      }
    mediaSession = session

    audioPlayer = SilentAudioFocusPlayer(context).also { it.start() }

    Log.i(TAG, "session started")
  }

  private fun stopSession() {
    pendingLongPress.values.forEach { mainHandler.removeCallbacks(it) }
    pendingLongPress.clear()
    longPressFired.clear()
    lastFireAt.clear()

    audioPlayer?.stop()
    audioPlayer = null

    mediaSession?.apply {
      isActive = false
      release()
    }
    mediaSession = null

    Log.i(TAG, "session stopped")
  }

  private fun handleMediaButtonIntent(mediaButtonIntent: Intent): Boolean {
    val keyEvent =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        mediaButtonIntent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
      } else {
        @Suppress("DEPRECATION")
        mediaButtonIntent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
      } ?: return false
    val key = mapKeyCode(keyEvent.keyCode) ?: return false

    when (keyEvent.action) {
      KeyEvent.ACTION_DOWN -> {
        // repeatCount == 0 is the first DOWN of this press. Some inputs
        // (a physically-held wired button) generate repeated DOWNs with an
        // increasing repeatCount while held; a Bluetooth AVRCP remote
        // typically sends exactly one DOWN and one UP per press instead. We
        // arm the long-press timer only once, on the first DOWN, either way.
        if (keyEvent.repeatCount == 0) onKeyDown(keyEvent.keyCode, key)
      }
      KeyEvent.ACTION_UP -> onKeyUp(keyEvent.keyCode, key)
    }
    return true
  }

  private fun onKeyDown(
    keyCode: Int,
    key: String,
  ) {
    longPressFired[keyCode] = false
    val runnable =
      Runnable {
        longPressFired[keyCode] = true
        emitKey(key, longPress = true)
      }
    pendingLongPress[keyCode] = runnable
    mainHandler.postDelayed(runnable, LONG_PRESS_MS)
  }

  private fun onKeyUp(
    keyCode: Int,
    key: String,
  ) {
    pendingLongPress.remove(keyCode)?.let { mainHandler.removeCallbacks(it) }
    val alreadyFiredLongPress = longPressFired.remove(keyCode) ?: false
    if (alreadyFiredLongPress) return // the long-press event already went out from the timer
    emitKey(key, longPress = false)
  }

  private fun emitKey(
    key: String,
    longPress: Boolean,
  ) {
    val now = SystemClock.elapsedRealtime()
    val debounceKey = "$key:$longPress"
    val last = lastFireAt[debounceKey] ?: 0L
    if (now - last < DEBOUNCE_MS) {
      Log.d(TAG, "debounced duplicate $debounceKey (${now - last}ms since last)")
      return
    }
    lastFireAt[debounceKey] = now

    Log.i(TAG, "key=$key longPress=$longPress")
    sendEvent("onKey", mapOf("key" to key, "longPress" to longPress))
  }

  /**
   * Maps a raw Android keycode to Roto's normalized [MediaKey] union. Returns
   * null for anything we don't handle, which onMediaButtonEvent treats as
   * "not consumed" so the system can fall back to its default behavior.
   */
  private fun mapKeyCode(keyCode: Int): String? =
    when (keyCode) {
      KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
      KeyEvent.KEYCODE_HEADSETHOOK,
      KeyEvent.KEYCODE_MEDIA_PLAY,
      KeyEvent.KEYCODE_MEDIA_PAUSE,
      -> "play_pause"
      KeyEvent.KEYCODE_MEDIA_NEXT -> "next"
      KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "previous"
      // Best-effort only -- see README.md "Limitations". Android normally
      // intercepts these as direct system stream-volume changes before (or
      // instead of) ever delivering them to a MediaSession callback; some
      // remotes/ROMs forward them here anyway, so we still map them.
      KeyEvent.KEYCODE_VOLUME_UP -> "volume_up"
      KeyEvent.KEYCODE_VOLUME_DOWN -> "volume_down"
      else -> null
    }
}
