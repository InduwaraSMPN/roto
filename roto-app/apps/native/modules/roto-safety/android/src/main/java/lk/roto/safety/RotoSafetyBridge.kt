package lk.roto.safety

import java.lang.ref.WeakReference

/**
 * In-process bridge from the Service/Activity (plain Android components, no
 * Expo context) back to the currently-alive RotoSafetyModule instance so they
 * can emit JS events. There is only ever one live module instance per running
 * app, so a single weak reference is enough; it is re-attached every time the
 * JS side reloads (OnCreate/OnDestroy on the module).
 */
object RotoSafetyBridge {
  @Volatile
  private var moduleRef: WeakReference<RotoSafetyModule>? = null

  fun attach(module: RotoSafetyModule) {
    moduleRef = WeakReference(module)
  }

  fun detach(module: RotoSafetyModule) {
    if (moduleRef?.get() === module) {
      moduleRef = null
    }
  }

  fun emitCrashSuspected(g: Double, speedBeforeKmh: Double, atMs: Long) {
    moduleRef?.get()?.sendEvent(
      "crashSuspected",
      mapOf(
        "g" to g,
        "speedBeforeKmh" to speedBeforeKmh,
        "at" to atMs.toDouble(),
      ),
    )
  }

  fun emitAlertOk() {
    moduleRef?.get()?.sendEvent("alertOk", emptyMap<String, Any?>())
  }

  fun emitAlertSend(lat: Double?, lon: Double?) {
    moduleRef?.get()?.sendEvent("alertSend", mapOf("lat" to lat, "lon" to lon))
  }
}
