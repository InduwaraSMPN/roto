package expo.modules.rotocar

import android.util.Log
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.DateTimeWithZone
import androidx.car.app.model.Distance
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Template
import androidx.car.app.navigation.NavigationManager
import androidx.car.app.navigation.model.Maneuver
import androidx.car.app.navigation.model.MapWithContentTemplate
import androidx.car.app.navigation.model.NavigationTemplate
import androidx.car.app.navigation.model.RoutingInfo
import androidx.car.app.navigation.model.Step
import androidx.car.app.navigation.model.TravelEstimate
import androidx.car.app.navigation.model.Trip
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import java.util.TimeZone

private const val TAG = "RotoCar"

/**
 * The only screen this module has. A `NAVIGATION`-category car app gets exactly two useful
 * templates (`NavigationTemplate`, `MapWithContentTemplate`); we show the second one whenever the
 * host has actually handed us a `Surface` to draw into, and the first one otherwise.
 *
 * // ponytail: the map itself is a *schematic* route drawing, not a street map - see the honest
 * note at the top of `RotoCarMapSurface.kt` for why a car host gives us a surface but no tiles. The
 * content pane is always the same `NavigationTemplate` (maneuver icon, street, distance, ETA), so
 * dropping back to it when no surface is available costs the rider nothing except the map region.
 * Upgrade path: swap the schematic renderer for a real vector/GL map with a tile source.
 */
class NavigationScreen(carContext: CarContext) : Screen(carContext) {

  private val navigationManager: NavigationManager
    get() = carContext.getCarService(NavigationManager::class.java)

  private val mapSurface = RotoCarMapSurface(carContext)

  /** Whether we've told the host navigation is active, so we call navigationStarted/Ended once. */
  private var navigationActive = false

  init {
    lifecycle.addObserver(object : DefaultLifecycleObserver {
      override fun onCreate(owner: LifecycleOwner) {
        RotoCarStore.onTripChanged = { onTripChanged() }
        // The host answers synchronously-ish; `onGetTemplate` below already re-checks, so if the
        // surface never arrives we simply stay on the text template.
        mapSurface.onSurfaceReady = { invalidate() }
        mapSurface.attach()
        // Pick up a trip that was already running before this screen existed (e.g. the car
        // reconnected mid-ride).
        onTripChanged()
      }

      override fun onDestroy(owner: LifecycleOwner) {
        RotoCarStore.onTripChanged = null
        mapSurface.onSurfaceReady = null
        mapSurface.detach()
        if (navigationActive) {
          navigationManager.navigationEnded()
          navigationActive = false
        }
      }
    })
  }

  private fun onTripChanged() {
    val trip = RotoCarStore.trip
    if (trip != null && !navigationActive) {
      Log.i(TAG, "navigation started: ${trip.destinationName}")
      navigationManager.navigationStarted()
      navigationActive = true
    } else if (trip == null && navigationActive) {
      Log.i(TAG, "navigation ended")
      navigationManager.navigationEnded()
      navigationActive = false
    }
    if (trip != null) {
      navigationManager.updateTrip(buildTrip(trip))
    }
    mapSurface.requestDraw()
    invalidate()
  }

  override fun onGetTemplate(): Template {
    val trip = RotoCarStore.trip ?: return idleTemplate()
    // No surface (old head unit, DHU without surface support, or a stale JS build that sends no
    // geometry) => the plain text template, never a blank half-screen.
    if (!mapSurface.isAvailable || !trip.hasGeometry) return navigationTemplate(trip)
    return MapWithContentTemplate.Builder()
      .setContentTemplate(navigationTemplate(trip))
      .setActionStrip(actionStrip())
      .build()
  }

  /** Shown before `startNavigation` is called, and again after `stopNavigation`/arrival. */
  private fun idleTemplate(): Template {
    return MessageTemplate.Builder("Open Roto on your phone to start")
      .setTitle("Roto")
      .setHeaderAction(Action.APP_ICON)
      .build()
  }

  private fun navigationTemplate(trip: RotoCarTrip): Template {
    val maneuver = Maneuver.Builder(ManeuverMapping.toCarManeuverType(trip.maneuverType)).build()
    val stepBuilder = Step.Builder(trip.instruction).setManeuver(maneuver)
    trip.street?.let { stepBuilder.setRoad(it) }

    val routingInfo = RoutingInfo.Builder()
      .setCurrentStep(stepBuilder.build(), Distance.create(trip.distanceM, Distance.UNIT_METERS))
      .build()

    val arrival = DateTimeWithZone.create(
      System.currentTimeMillis() + trip.etaMin * 60_000L,
      TimeZone.getDefault()
    )
    val destinationEstimate = TravelEstimate.Builder(
      Distance.create(trip.remainingKm, Distance.UNIT_KILOMETERS),
      arrival
    )
      .setRemainingTimeSeconds(trip.etaMin * 60L)
      // Roto's one signal-yellow accent (DESIGN.md), used on a single small text field only.
      .setRemainingDistanceColor(CarColor.YELLOW)
      .build()

    return NavigationTemplate.Builder()
      .setNavigationInfo(routingInfo)
      .setDestinationTravelEstimate(destinationEstimate)
      .setActionStrip(actionStrip())
      .build()
  }

  /**
   * // ponytail: title-only actions, no `CarIcon`. Bundling stop/repeat/sos glyphs would mean
   * either shipping vector drawables in this module's own `res/drawable` (fine, just not done
   * yet) or reaching into the host app's resources (which this module deliberately doesn't
   * depend on). Add icons here once the module ships its own drawables; text-only actions are
   * fully valid per the ActionStrip API and are legible on every head unit in the meantime.
   */
  private fun actionStrip(): ActionStrip {
    return ActionStrip.Builder()
      .addAction(
        Action.Builder()
          .setTitle("Stop")
          .setOnClickListener { RotoCarStore.dispatchAction("stop") }
          .build()
      )
      .addAction(
        Action.Builder()
          .setTitle("Repeat")
          .setOnClickListener { RotoCarStore.dispatchAction("repeat") }
          .build()
      )
      .addAction(
        Action.Builder()
          .setTitle("SOS")
          .setOnClickListener { RotoCarStore.dispatchAction("sos") }
          .build()
      )
      .build()
  }

  private fun buildTrip(trip: RotoCarTrip): Trip {
    val maneuver = Maneuver.Builder(ManeuverMapping.toCarManeuverType(trip.maneuverType)).build()
    val stepBuilder = Step.Builder(trip.instruction).setManeuver(maneuver)
    trip.street?.let { stepBuilder.setRoad(it) }

    val arrival = DateTimeWithZone.create(
      System.currentTimeMillis() + trip.etaMin * 60_000L,
      TimeZone.getDefault()
    )
    val stepEstimate = TravelEstimate.Builder(
      Distance.create(trip.distanceM, Distance.UNIT_METERS),
      arrival
    ).build()

    return Trip.Builder()
      .addStep(stepBuilder.build(), stepEstimate)
      .setCurrentRoad(trip.street ?: trip.destinationName)
      .setLoading(false)
      .build()
  }
}
