package expo.modules.rotocar

import android.content.pm.ApplicationInfo
import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

/**
 * Entry point the car host binds to (declared in the app manifest by `plugin/with-roto-car.js`
 * as `lk.roto.app.RotoCarAppService`, aliased here via the `<service android:name>` value - see
 * the plugin for the exact class name used).
 */
class RotoCarAppService : CarAppService() {

  override fun onCreateSession(): Session = RotoCarSession()

  /**
   * The host validator decides which apps are allowed to bind to this service at all. In debug
   * builds we allow everything so the Desktop Head Unit (which has no production signature) can
   * connect; in release builds we restrict to hosts androidx.car.app itself ships a certificate
   * allowlist for (Google's Android Auto / Android Automotive host apps), via the library's own
   * bundled `hosts_allowlist_sample` resource - see
   * https://developer.android.com/reference/androidx/car/app/validation/HostValidator.Builder.
   */
  override fun createHostValidator(): HostValidator {
    val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    return if (isDebuggable) {
      HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
    } else {
      HostValidator.Builder(applicationContext)
        .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
        .build()
    }
  }
}
