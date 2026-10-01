package expo.modules.rotocar

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val EVENT_CONNECTED = "connected"
private const val EVENT_DISCONNECTED = "disconnected"
private const val EVENT_ACTION = "action"

/**
 * JS bridge for Android Auto. This module never talks to `androidx.car.app` directly - it only
 * reads/writes `RotoCarStore`, which `RotoCarSession`/`NavigationScreen` (running in the car
 * host's process/lifecycle, started independently by Android when a head unit connects) also
 * read/write. That split is what lets `startNavigation`/`updateTrip`/`stopNavigation` work whether
 * or not a car is currently connected: JS always writes the latest trip into the store, and
 * whichever `NavigationScreen` is alive (if any) picks it up via `RotoCarStore.onTripChanged`.
 */
class RotoCarModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RotoCar")

    Events(EVENT_CONNECTED, EVENT_DISCONNECTED, EVENT_ACTION)

    OnCreate {
      // RotoCarStore callbacks fan out to every listener that has set one; only one JS instance
      // of this module exists per app process, so plain assignment (not +=) is correct here.
      RotoCarStore.onConnectionChanged = { connected ->
        sendEvent(if (connected) EVENT_CONNECTED else EVENT_DISCONNECTED)
      }
      RotoCarStore.onAction = { id ->
        sendEvent(EVENT_ACTION, mapOf("id" to id))
      }
      // If a car session is already alive when JS (re)initializes - e.g. after a JS reload while
      // driving - report the current connection state immediately instead of waiting for the
      // next connect/disconnect transition.
      if (RotoCarStore.connected) {
        sendEvent(EVENT_CONNECTED)
      }
    }

    OnDestroy {
      RotoCarStore.onConnectionChanged = null
      RotoCarStore.onAction = null
    }

    Function("isConnected") {
      RotoCarStore.connected
    }

    Function("startNavigation") { options: StartNavigationOptions ->
      RotoCarStore.startTrip(options.destinationName, options.destLat, options.destLon)
    }

    Function("updateTrip") { update: TripUpdateRecord ->
      RotoCarStore.updateTrip(update)
    }

    Function("stopNavigation") {
      RotoCarStore.stopTrip()
    }
  }
}
