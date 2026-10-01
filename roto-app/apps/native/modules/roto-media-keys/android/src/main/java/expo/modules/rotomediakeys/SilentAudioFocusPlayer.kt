package expo.modules.rotomediakeys

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

private const val TAG = "RotoMediaKeys"
private const val SAMPLE_RATE = 8000

/**
 * ponytail: streams true digital silence through [AudioTrack] while holding
 * transient, duck-only audio focus, for as long as a ride's MediaSession is
 * running. This is a deliberate workaround, not a feature -- see
 * README.md "Limitations".
 *
 * Why it exists: Android routes hardware media-button presses to whichever
 * MediaSession the system currently considers highest priority, and that
 * ranking is driven by actual playback state, not by [MediaSessionCompat]
 * being merely `active`. A session that is active but has never played
 * anything routinely loses button events to a real player (Spotify, Samsung
 * Music, a podcast app, ...), especially right after a Bluetooth route
 * change. Playing silence is the smallest honest way to look "playing" to
 * that arbitration without audibly interrupting whatever the rider already
 * has on -- it is not a guarantee. A track actually producing audio at the
 * exact moment of the button press keeps priority regardless of what this
 * class does.
 *
 * `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` + `setWillPauseWhenDucked(false)` is
 * chosen over a full `AUDIOFOCUS_GAIN` on purpose: a permanent, exclusive
 * focus request would pause the rider's actual music/podcast the moment
 * navigation starts, which is a worse outcome than an occasional missed
 * button. The trade-off is that this silent stream can still register as a
 * "duck" with other apps; because it is literal silence there should be no
 * audible effect, but this has not been verified against every OEM's audio
 * stack.
 */
class SilentAudioFocusPlayer(private val context: Context) {
  private var audioTrack: AudioTrack? = null
  private var focusRequest: AudioFocusRequest? = null
  private val running = AtomicBoolean(false)

  private val audioManager: AudioManager?
    get() = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private val focusListener =
    AudioManager.OnAudioFocusChangeListener { change ->
      Log.d(TAG, "audio focus changed: $change")
      // No-op. Losing focus (a phone call, another app taking exclusive
      // focus, ...) just means we go back to competing on session priority
      // alone until the next start()/key press. We never fight to regain it
      // aggressively -- that would be worse for the rider than a missed
      // button.
    }

  fun start() {
    if (!running.compareAndSet(false, true)) return

    val am = audioManager
    if (am == null) {
      running.set(false)
      Log.w(TAG, "no AudioManager available; hardware buttons may route elsewhere")
      return
    }

    val attributes =
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()

    val granted =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val request =
          AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attributes)
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener(focusListener)
            .build()
        focusRequest = request
        am.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
      } else {
        @Suppress("DEPRECATION")
        am.requestAudioFocus(
          focusListener,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK,
        ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
      }

    if (!granted) {
      Log.w(TAG, "audio focus not granted; hardware buttons may route elsewhere")
    }

    val minBuffer =
      AudioTrack.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_OUT_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
      ).coerceAtLeast(SAMPLE_RATE / 4)

    val track =
      AudioTrack.Builder()
        .setAudioAttributes(attributes)
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build(),
        )
        .setBufferSizeInBytes(minBuffer)
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()
    audioTrack = track

    val silence = ShortArray(minBuffer / 2) // all-zero buffer: true digital silence
    track.play()

    // A dedicated daemon thread feeds the blocking AudioTrack.write() loop.
    // stop() calling AudioTrack.stop()/release() concurrently is the
    // documented way to unblock a thread parked in write(); this is a small,
    // private, single-purpose thread, not something callers interact with.
    thread(name = "RotoMediaKeysSilence", isDaemon = true) {
      while (running.get()) {
        track.write(silence, 0, silence.size)
      }
    }
  }

  fun stop() {
    if (!running.compareAndSet(true, false)) return

    audioTrack?.let { track ->
      try {
        track.stop()
      } catch (e: IllegalStateException) {
        Log.w(TAG, "AudioTrack.stop() while not playing", e)
      }
      track.release()
    }
    audioTrack = null

    val am = audioManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { am?.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      am?.abandonAudioFocus(focusListener)
    }
    focusRequest = null
  }
}
