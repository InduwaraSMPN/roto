package expo.modules.rotocar

import android.content.Intent
import android.util.Log
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.navigation.NavigationManager
import androidx.car.app.navigation.NavigationManagerCallback
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

private const val TAG = "RotoCar"

/**
 * One `RotoCarSession` exists per car connection (the Desktop Head Unit, or a real head unit over
 * Bluetooth/USB). Its job is just plumbing: report connect/disconnect to `RotoCarStore` (so
 * `RotoCarModule` can tell JS), wire up the `NavigationManagerCallback` the host needs, and hand
 * back the single `NavigationScreen` that does the actual rendering.
 */
class RotoCarSession : Session() {

  private val navigationManager: NavigationManager
    get() = carContext.getCarService(NavigationManager::class.java)

  init {
    lifecycle.addObserver(object : DefaultLifecycleObserver {
      override fun onCreate(owner: LifecycleOwner) {
        Log.i(TAG, "session created (car connected)")
        RotoCarStore.setConnected(true)
      }

      override fun onDestroy(owner: LifecycleOwner) {
        Log.i(TAG, "session destroyed (car disconnected)")
        RotoCarStore.setConnected(false)
        navigationManager.clearNavigationManagerCallback()
      }
    })
  }

  override fun onCreateScreen(intent: Intent): Screen {
    // ponytail: `onStopNavigation` fires when the host itself decides navigation must stop (e.g.
    // the user picks a different nav app, or - required for a Play Store navigation-category
    // review - `AUTO_DRIVE` simulation via `adb shell dumpsys activity service ... AUTO_DRIVE`).
    // We only forward the request to JS here; the phone-side navigator (`use-navigation.ts`,
    // not yet built) owns whether navigation actually stops, same as the ActionStrip "Stop"
    // action in NavigationScreen. True auto-drive simulation is a Phase 5 polish item, not v1.
    navigationManager.setNavigationManagerCallback(object : NavigationManagerCallback {
      override fun onStopNavigation() {
        RotoCarStore.dispatchAction("stop")
      }
    })
    return NavigationScreen(carContext)
  }
}
