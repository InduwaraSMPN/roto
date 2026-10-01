package lk.roto.safety

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import java.lang.ref.WeakReference

/**
 * Raises (and tears down) the crash alert: a HIGH-importance notification whose
 * full-screen intent opens [CrashAlertActivity] over the lock screen when the
 * system allows it, and which always also carries "I'm OK" / "Send now" actions
 * as a heads-up fallback for when it doesn't (context/feature-parity-plan.md §4.12,
 * §1.3 "Full-screen SOS over lock screen").
 */
object CrashAlertPresenter {
  const val CHANNEL_SOS = "roto-sos"
  private const val NOTIFICATION_ID = 934_199

  const val EXTRA_MODE = "lk.roto.safety.MODE"
  const val MODE_FULL = "full"
  const val MODE_OK = "ok"
  const val MODE_SEND = "send"
  const val EXTRA_COUNTDOWN_S = "countdownS"
  const val EXTRA_TITLE = "title"
  const val EXTRA_BODY = "body"
  const val EXTRA_OK_LABEL = "okLabel"
  const val EXTRA_SEND_LABEL = "sendLabel"

  @Volatile
  private var activityRef: WeakReference<CrashAlertActivity>? = null

  fun attach(activity: CrashAlertActivity) {
    activityRef = WeakReference(activity)
  }

  fun detach(activity: CrashAlertActivity) {
    if (activityRef?.get() === activity) activityRef = null
  }

  fun present(
    context: Context,
    countdownS: Int,
    title: String?,
    body: String?,
    okLabel: String?,
    sendLabel: String?,
    g: Double?,
    speedBeforeKmh: Double?,
  ) {
    ensureChannel(context)

    val fullScreenPending = activityPendingIntent(context, MODE_FULL, countdownS, title, body, okLabel, sendLabel, 1)
    val okPending = activityPendingIntent(context, MODE_OK, countdownS, title, body, okLabel, sendLabel, 2)
    val sendPending = activityPendingIntent(context, MODE_SEND, countdownS, title, body, okLabel, sendLabel, 3)

    val builder = buildNotification(context, title, body, okLabel, sendLabel, fullScreenPending, okPending, sendPending)

    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIFICATION_ID, builder)

    Log.i("RotoSafety", "crash alert presented g=$g speedBeforeKmh=$speedBeforeKmh")
  }

  fun dismiss(context: Context) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(NOTIFICATION_ID)
    activityRef?.get()?.finish()
  }

  @Suppress("DEPRECATION")
  private fun buildNotification(
    context: Context,
    title: String?,
    body: String?,
    okLabel: String?,
    sendLabel: String?,
    fullScreenPending: PendingIntent,
    okPending: PendingIntent,
    sendPending: PendingIntent,
  ): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_SOS)
    } else {
      Notification.Builder(context)
    }
    return builder
      .setContentTitle(title ?: "Possible crash detected")
      .setContentText(body ?: "Roto detected a possible crash. Tap to respond.")
      .setSmallIcon(context.applicationInfo.icon)
      .setPriority(Notification.PRIORITY_MAX)
      .setCategory(Notification.CATEGORY_ALARM)
      .setAutoCancel(false)
      .setOngoing(true)
      .setFullScreenIntent(fullScreenPending, true)
      .setContentIntent(fullScreenPending)
      .addAction(0, okLabel ?: "I'm OK", okPending)
      .addAction(0, sendLabel ?: "Send now", sendPending)
      .build()
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_SOS) != null) return
    val channel = NotificationChannel(CHANNEL_SOS, "Crash SOS", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Roto's crash alert countdown"
      enableLights(true)
      enableVibration(true)
      setBypassDnd(true)
    }
    nm.createNotificationChannel(channel)
  }

  private fun activityPendingIntent(
    context: Context,
    mode: String,
    countdownS: Int,
    title: String?,
    body: String?,
    okLabel: String?,
    sendLabel: String?,
    requestCode: Int,
  ): PendingIntent {
    val intent = Intent(context, CrashAlertActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NO_ANIMATION)
      putExtra(EXTRA_MODE, mode)
      putExtra(EXTRA_COUNTDOWN_S, countdownS)
      title?.let { putExtra(EXTRA_TITLE, it) }
      body?.let { putExtra(EXTRA_BODY, it) }
      okLabel?.let { putExtra(EXTRA_OK_LABEL, it) }
      sendLabel?.let { putExtra(EXTRA_SEND_LABEL, it) }
    }
    val mutableFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or mutableFlag)
  }
}
