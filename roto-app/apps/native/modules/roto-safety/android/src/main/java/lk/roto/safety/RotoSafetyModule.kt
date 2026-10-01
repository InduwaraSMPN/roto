package lk.roto.safety

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import lk.roto.safety.records.CrashAlertOptions
import lk.roto.safety.records.StartOptions

class RotoSafetyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RotoSafety")

    Events("crashSuspected", "alertOk", "alertSend")

    OnCreate {
      RotoSafetyBridge.attach(this@RotoSafetyModule)
    }

    OnDestroy {
      RotoSafetyBridge.detach(this@RotoSafetyModule)
    }

    Function("isAvailable") {
      val context = appContext.reactContext
      context != null && context.packageManager.hasSystemFeature(PackageManager.FEATURE_SENSOR_ACCELEROMETER)
    }

    AsyncFunction("start") { options: StartOptions ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      CrashDetectorService.start(
        context,
        options.thresholdG,
        options.minSpeedKmh,
        options.lowRate,
      )
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      CrashDetectorService.stop(context)
    }

    Function("updateSpeed") { kmh: Double ->
      CrashDetectorService.pushSpeedKmh(kmh)
    }

    Function("setLowRate") { enabled: Boolean ->
      CrashDetectorService.setLowRate(enabled)
    }

    AsyncFunction("canUseFullScreenIntent") {
      val context = appContext.reactContext ?: return@AsyncFunction true
      if (Build.VERSION.SDK_INT >= 34) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.canUseFullScreenIntent()
      } else {
        // Permission does not exist before Android 14; the manifest grant is enough.
        true
      }
    }

    AsyncFunction("requestFullScreenIntent") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      if (Build.VERSION.SDK_INT >= 34) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
          data = Uri.fromParts("package", context.packageName, null)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      }
    }

    AsyncFunction("showCrashAlert") { options: CrashAlertOptions ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      CrashAlertPresenter.present(
        context = context,
        countdownS = options.countdownS ?: 30,
        title = options.title,
        body = options.body,
        okLabel = options.okLabel,
        sendLabel = options.sendLabel,
        g = null,
        speedBeforeKmh = null,
      )
    }

    AsyncFunction("dismissCrashAlert") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      CrashAlertPresenter.dismiss(context)
    }

    // Dev-only preview of the full alert flow with synthetic values. The JS
    // wrapper (index.ts) gates the *call* on __DEV__; this native side stays
    // simple and always available so it is trivial to trigger from adb too:
    //   adb shell am broadcast ... (not wired) — use the JS debugSimulate() or
    //   a hidden dev-menu button instead; see README.md.
    AsyncFunction("debugSimulate") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      CrashAlertPresenter.present(
        context = context,
        countdownS = 30,
        title = null,
        body = null,
        okLabel = null,
        sendLabel = null,
        g = 6.0,
        speedBeforeKmh = 42.0,
      )
    }
  }
}
