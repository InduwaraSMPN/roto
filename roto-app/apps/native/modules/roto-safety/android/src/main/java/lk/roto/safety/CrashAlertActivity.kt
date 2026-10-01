package lk.roto.safety

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

private const val TAG = "RotoSafety"

/**
 * Full-screen countdown shown over the lock screen when a crash is suspected.
 * Launched three ways, all via [CrashAlertPresenter]'s PendingIntents:
 *  - MODE_FULL: the real full-screen-intent launch, or the user tapping the
 *    notification body. Shows the countdown UI below.
 *  - MODE_OK / MODE_SEND: the user tapped a notification action button while
 *    the phone was unlocked (no full-screen launch happened, only a heads-up
 *    notification). These resolve immediately without drawing any UI.
 *
 * No slide-to-cancel here on purpose — that gesture belongs to the in-app UI
 * when the app is already open and foregrounded (context/feature-parity-plan.md
 * §4.12); this activity only has to work from a cold, locked screen.
 */
class CrashAlertActivity : Activity() {
  private var countdownTimer: CountDownTimer? = null
  private var statusText: TextView? = null
  private var resolved = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    when (intent.getStringExtra(CrashAlertPresenter.EXTRA_MODE)) {
      CrashAlertPresenter.MODE_OK -> {
        resolveOk()
        return
      }
      CrashAlertPresenter.MODE_SEND -> {
        resolveSend()
        return
      }
    }

    showOverLockScreen()
    CrashAlertPresenter.attach(this)

    val countdownS = intent.getIntExtra(CrashAlertPresenter.EXTRA_COUNTDOWN_S, 30)
    val title = intent.getStringExtra(CrashAlertPresenter.EXTRA_TITLE) ?: "Possible crash detected"
    val body = intent.getStringExtra(CrashAlertPresenter.EXTRA_BODY)
      ?: "We'll alert your contacts if you don't respond."
    val okLabel = intent.getStringExtra(CrashAlertPresenter.EXTRA_OK_LABEL) ?: "I'm OK"
    val sendLabel = intent.getStringExtra(CrashAlertPresenter.EXTRA_SEND_LABEL) ?: "Send now"

    setContentView(buildLayout(title, body, okLabel, sendLabel, countdownS))
    startCountdown(countdownS)
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
      )
    }
    val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    keyguardManager?.requestDismissKeyguard(this, null)
  }

  private fun buildLayout(
    title: String,
    body: String,
    okLabel: String,
    sendLabel: String,
    countdownS: Int,
  ): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      // DESIGN.md "night highway": near-black background, signal yellow accent only.
      setBackgroundColor(Color.parseColor("#1A1200"))
      setPadding(64, 96, 64, 96)
    }

    val titleView = TextView(this).apply {
      text = title
      setTextColor(Color.WHITE)
      textSize = 24f
      gravity = Gravity.CENTER
    }
    val bodyView = TextView(this).apply {
      text = body
      setTextColor(Color.parseColor("#CCCCCC"))
      textSize = 16f
      gravity = Gravity.CENTER
      setPadding(0, 24, 0, 48)
    }
    statusText = TextView(this).apply {
      text = secondsLabel(countdownS)
      setTextColor(Color.parseColor("#FFB300"))
      textSize = 48f
      gravity = Gravity.CENTER
      setPadding(0, 0, 0, 64)
    }

    val buttonParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = 24 }

    val okButton = Button(this).apply {
      text = okLabel
      textSize = 20f
      setPadding(0, 32, 0, 32)
      setOnClickListener { resolveOk() }
    }
    val sendButton = Button(this).apply {
      text = sendLabel
      textSize = 20f
      setPadding(0, 32, 0, 32)
      setBackgroundColor(Color.parseColor("#FFB300"))
      setTextColor(Color.parseColor("#1A1200"))
      setOnClickListener { resolveSend() }
    }

    root.addView(titleView)
    root.addView(bodyView)
    root.addView(statusText)
    root.addView(okButton, buttonParams)
    root.addView(sendButton, buttonParams)
    return root
  }

  private fun startCountdown(countdownS: Int) {
    countdownTimer = object : CountDownTimer(countdownS * 1000L, 1000L) {
      override fun onTick(millisUntilFinished: Long) {
        statusText?.text = secondsLabel((millisUntilFinished / 1000L).toInt() + 1)
      }

      override fun onFinish() {
        resolveSend()
      }
    }.start()
  }

  private fun resolveOk() {
    if (resolved) return
    resolved = true
    countdownTimer?.cancel()
    RotoSafetyBridge.emitAlertOk()
    CrashAlertPresenter.dismiss(applicationContext)
    finish()
  }

  private fun resolveSend() {
    if (resolved) return
    resolved = true
    countdownTimer?.cancel()
    val loc = lastKnownLocationOrNull()
    RotoSafetyBridge.emitAlertSend(loc?.latitude, loc?.longitude)
    CrashAlertPresenter.dismiss(applicationContext)
    finish()
  }

  private fun secondsLabel(s: Int) = s.toString()

  private fun lastKnownLocationOrNull(): Location? {
    return try {
      if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
        checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
      ) {
        return null
      }
      val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
      lm.getProviders(true)
        .asReversed()
        .firstNotNullOfOrNull { provider -> lm.getLastKnownLocation(provider) }
    } catch (e: SecurityException) {
      Log.w(TAG, "no location permission for crash alert location", e)
      null
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    // android:launchMode="singleTask" means a second PendingIntent for this
    // activity (e.g. a notification action tapped while the countdown screen
    // is already showing) arrives here instead of a fresh onCreate.
    setIntent(intent)
    when (intent.getStringExtra(CrashAlertPresenter.EXTRA_MODE)) {
      CrashAlertPresenter.MODE_OK -> resolveOk()
      CrashAlertPresenter.MODE_SEND -> resolveSend()
    }
  }

  @Suppress("DEPRECATION")
  override fun onBackPressed() {
    // Ignore back: the rider must choose I'm OK / Send now, or let the countdown run out.
  }

  override fun onDestroy() {
    countdownTimer?.cancel()
    CrashAlertPresenter.detach(this)
    super.onDestroy()
  }
}
