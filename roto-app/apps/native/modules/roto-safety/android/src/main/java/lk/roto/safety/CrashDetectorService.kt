package lk.roto.safety

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlin.math.sqrt

private const val TAG = "RotoSafety"

/**
 * Foreground service (type "location") that owns the crash-detection sensors so
 * they keep running with the screen off. Algorithm from
 * context/feature-parity-plan.md §4.12:
 *   1. Impact: resultant accelerometer reading >= [thresholdG].
 *   2. Context: speed was >= [minSpeedKmh] at some point in the previous 10s
 *      (from FusedLocationProviderClient, or from JS via [pushSpeedKmh]).
 *   3. Stillness: over the next 10s, average speed stays < 3 km/h and the
 *      accelerometer reading has low variance (rider is down, not still riding).
 *   4. Only then raise `crashSuspected` — and only once per 5 minutes.
 */
class CrashDetectorService : Service(), SensorEventListener {
  private var sensorManager: SensorManager? = null
  private var accelerometer: Sensor? = null
  private var gyroscope: Sensor? = null
  private var fusedClient: FusedLocationProviderClient? = null
  private var locationCallback: LocationCallback? = null

  private var thresholdG = DEFAULT_THRESHOLD_G
  private var minSpeedKmh = DEFAULT_MIN_SPEED_KMH
  private var lowRate = false

  private data class SpeedSample(val atMs: Long, val kmh: Double)

  private val speedSamples = ArrayDeque<SpeedSample>()

  // Stillness-check state, active only in the 10s window right after an impact.
  private var watching = false
  private var watchStartAtMs = 0L
  private var watchSpeedSum = 0.0
  private var watchSpeedCount = 0
  private var watchAccelReadings = mutableListOf<Double>()
  private var pendingG = 0.0
  private var pendingSpeedBeforeKmh = 0.0
  private var lastEventAtMs = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    gyroscope = sensorManager?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    fusedClient = LocationServices.getFusedLocationProviderClient(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    thresholdG = intent?.getDoubleExtra(EXTRA_THRESHOLD_G, thresholdG) ?: thresholdG
    minSpeedKmh = intent?.getDoubleExtra(EXTRA_MIN_SPEED_KMH, minSpeedKmh) ?: minSpeedKmh
    lowRate = intent?.getBooleanExtra(EXTRA_LOW_RATE, lowRate) ?: lowRate

    startForegroundCompat(buildWatchNotification())
    registerSensors()
    requestLocationUpdates()
    Log.i(TAG, "watch started thresholdG=$thresholdG minSpeedKmh=$minSpeedKmh lowRate=$lowRate")
    // Sticky: if the OS kills the process under memory pressure, restart the
    // watch (without extras, so it falls back to the last-set thresholds).
    return START_STICKY
  }

  override fun onDestroy() {
    unregisterSensors()
    locationCallback?.let { fusedClient?.removeLocationUpdates(it) }
    locationCallback = null
    if (instance === this) instance = null
    Log.i(TAG, "watch stopped")
    super.onDestroy()
  }

  private fun registerSensors() {
    sensorManager?.unregisterListener(this)
    val delay = if (lowRate) SensorManager.SENSOR_DELAY_NORMAL else SensorManager.SENSOR_DELAY_GAME
    accelerometer?.let { sensorManager?.registerListener(this, it, delay) }
    // Gyroscope is registered but currently only reserved for future refinement
    // (e.g. distinguishing a highside from a pothole); the algorithm above only
    // reads the accelerometer today.
    gyroscope?.let { sensorManager?.registerListener(this, it, delay) }
  }

  private fun unregisterSensors() {
    sensorManager?.unregisterListener(this)
  }

  private fun requestLocationUpdates() {
    locationCallback?.let { fusedClient?.removeLocationUpdates(it) }

    val intervalMs = if (lowRate) 5000L else 2000L
    val request = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, intervalMs).build()
    val callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        val location = result.lastLocation ?: return
        pushSpeedSample(location.speed * 3.6)
      }
    }
    locationCallback = callback
    try {
      fusedClient?.requestLocationUpdates(request, callback, mainLooper)
    } catch (e: SecurityException) {
      // expo-location owns the runtime permission prompt; if it hasn't been
      // granted yet we simply rely on RotoSafety.updateSpeed(kmh) from JS.
      Log.w(TAG, "no location permission yet, relying on updateSpeed() from JS", e)
    }
  }

  private fun pushSpeedSample(speedKmh: Double) {
    val now = System.currentTimeMillis()
    speedSamples.addLast(SpeedSample(now, speedKmh))
    while (speedSamples.isNotEmpty() && now - speedSamples.first().atMs > SPEED_WINDOW_MS) {
      speedSamples.removeFirst()
    }
    if (watching) {
      watchSpeedSum += speedKmh
      watchSpeedCount++
    }
  }

  private fun maxSpeedInWindowKmh(): Double = speedSamples.maxOfOrNull { it.kmh } ?: 0.0

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
      handleAccelerometer(event)
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  private fun handleAccelerometer(event: SensorEvent) {
    val x = event.values[0].toDouble()
    val y = event.values[1].toDouble()
    val z = event.values[2].toDouble()
    val gForce = sqrt(x * x + y * y + z * z) / SensorManager.GRAVITY_EARTH

    if (watching) {
      watchAccelReadings.add(gForce)
      if (System.currentTimeMillis() - watchStartAtMs >= STILLNESS_WINDOW_MS) {
        finishStillnessCheck()
      }
      return
    }

    if (gForce < thresholdG) return

    val now = System.currentTimeMillis()
    if (now - lastEventAtMs < EVENT_COOLDOWN_MS) return

    val speedBefore = maxSpeedInWindowKmh()
    if (speedBefore < minSpeedKmh) return

    watching = true
    watchStartAtMs = now
    watchSpeedSum = 0.0
    watchSpeedCount = 0
    watchAccelReadings = mutableListOf()
    pendingG = gForce
    pendingSpeedBeforeKmh = speedBefore
    Log.i(TAG, "impact detected g=$gForce speedBeforeKmh=$speedBefore, watching for stillness")
  }

  private fun finishStillnessCheck() {
    watching = false
    val avgSpeed = if (watchSpeedCount > 0) watchSpeedSum / watchSpeedCount else 0.0
    val variance = varianceOf(watchAccelReadings)
    val isStill = avgSpeed < STILLNESS_MAX_SPEED_KMH && variance < STILLNESS_MAX_ACCEL_VARIANCE

    if (isStill) {
      lastEventAtMs = System.currentTimeMillis()
      Log.i(TAG, "stillness confirmed avgSpeed=$avgSpeed variance=$variance, raising crashSuspected")
      RotoSafetyBridge.emitCrashSuspected(pendingG, pendingSpeedBeforeKmh, lastEventAtMs)
      CrashAlertPresenter.present(
        context = this,
        countdownS = 30,
        title = null,
        body = null,
        okLabel = null,
        sendLabel = null,
        g = pendingG,
        speedBeforeKmh = pendingSpeedBeforeKmh,
      )
    } else {
      Log.i(TAG, "rider kept moving (avgSpeed=$avgSpeed variance=$variance), impact dismissed as false alarm")
    }
  }

  private fun varianceOf(values: List<Double>): Double {
    if (values.size < 2) return 0.0
    val mean = values.average()
    return values.sumOf { (it - mean) * (it - mean) } / values.size
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  @Suppress("DEPRECATION")
  private fun buildWatchNotification(): Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      if (nm.getNotificationChannel(CHANNEL_WATCH) == null) {
        val channel = NotificationChannel(CHANNEL_WATCH, "Crash watch", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Roto is watching for crashes while you ride"
        }
        nm.createNotificationChannel(channel)
      }
    }

    val contentIntent = packageManager.getLaunchIntentForPackage(packageName)?.let { launchIntent ->
      launchIntent.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
      val mutableFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
      PendingIntent.getActivity(this, 0, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT or mutableFlag)
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_WATCH)
    } else {
      Notification.Builder(this)
    }
    builder
      .setContentTitle("Roto crash watch is on")
      .setContentText("Riding safely. Tap to open Roto.")
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
    contentIntent?.let { builder.setContentIntent(it) }
    return builder.build()
  }

  companion object {
    const val DEFAULT_THRESHOLD_G = 4.0
    const val DEFAULT_MIN_SPEED_KMH = 15.0

    private const val NOTIFICATION_ID = 934_102
    private const val CHANNEL_WATCH = "roto-safety-watch"
    private const val SPEED_WINDOW_MS = 10_000L
    private const val STILLNESS_WINDOW_MS = 10_000L
    private const val STILLNESS_MAX_SPEED_KMH = 3.0

    // Empirical: a phone at rest on a mounted handlebar reads ~1g +/- sensor
    // noise, variance well under 0.1 g^2. 0.35 g^2 gives headroom for vibration
    // from a running idle engine while still rejecting "still moving" motion.
    private const val STILLNESS_MAX_ACCEL_VARIANCE = 0.35

    private const val EVENT_COOLDOWN_MS = 5 * 60 * 1000L

    const val EXTRA_THRESHOLD_G = "thresholdG"
    const val EXTRA_MIN_SPEED_KMH = "minSpeedKmh"
    const val EXTRA_LOW_RATE = "lowRate"

    @Volatile
    private var instance: CrashDetectorService? = null

    fun start(context: Context, thresholdG: Double?, minSpeedKmh: Double?, lowRate: Boolean?) {
      val intent = Intent(context, CrashDetectorService::class.java).apply {
        putExtra(EXTRA_THRESHOLD_G, thresholdG ?: DEFAULT_THRESHOLD_G)
        putExtra(EXTRA_MIN_SPEED_KMH, minSpeedKmh ?: DEFAULT_MIN_SPEED_KMH)
        putExtra(EXTRA_LOW_RATE, lowRate ?: false)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, CrashDetectorService::class.java))
    }

    /** Fallback speed feed pushed from JS (RotoSafety.updateSpeed). */
    fun pushSpeedKmh(kmh: Double) {
      instance?.pushSpeedSample(kmh)
    }

    fun setLowRate(enabled: Boolean) {
      instance?.let {
        it.lowRate = enabled
        it.registerSensors()
        it.requestLocationUpdates()
      }
    }
  }
}
