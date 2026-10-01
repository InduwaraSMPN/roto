package expo.modules.rotocar

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** JS-facing shape of `RotoCar.startNavigation({ destinationName, destLat, destLon })`. */
class StartNavigationOptions(
  @Field val destinationName: String = "",
  @Field val destLat: Double? = null,
  @Field val destLon: Double? = null
) : Record

/**
 * JS-facing shape of `RotoCar.updateTrip({...})`. Field names must match `index.ts`'s `TripUpdate`.
 *
 * The trailing lat/lon fields are all optional: a caller that only wants the text template (an old
 * `use-navigation.ts`, or the compass/GPX case) can keep sending just the first seven, and
 * `NavigationScreen` then falls back to the plain `NavigationTemplate`.
 */
class TripUpdateRecord(
  @Field val maneuverType: Int = 0,
  @Field val instruction: String = "",
  @Field val distanceM: Double = 0.0,
  @Field val street: String? = null,
  @Field val remainingKm: Double = 0.0,
  @Field val etaMin: Int = 0,
  @Field val speedLimitKmh: Int? = null,
  /** Rider's current position. */
  @Field val lat: Double? = null,
  @Field val lon: Double? = null,
  /** Flat `[lon, lat, lon, lat, …]` GeoJSON-order polyline of the route still ahead. */
  @Field val path: List<Double>? = null,
  /** The point the current maneuver happens at, i.e. `route.coords[maneuver.beginIdx]`. */
  @Field val mnvLat: Double? = null,
  @Field val mnvLon: Double? = null
) : Record

/** Everything the car side needs to render the current trip. */
data class RotoCarTrip(
  val destinationName: String,
  val maneuverType: Int,
  val instruction: String,
  val distanceM: Double,
  val street: String?,
  val remainingKm: Double,
  val etaMin: Int,
  val speedLimitKmh: Int?,
  val lat: Double?,
  val lon: Double?,
  /** Flat `[lon, lat, …]`. Empty when JS is not sending geometry. */
  val path: List<Double>,
  val destLat: Double?,
  val destLon: Double?,
  val mnvLat: Double?,
  val mnvLon: Double?
) {
  /** True when there is enough geometry for `RotoCarMapSurface` to draw a schematic map. */
  val hasGeometry: Boolean
    get() = lat != null && lon != null && path.size >= 4
}

/**
 * // ponytail: a process-wide singleton, not a database or DataStore. `RotoCarModule` (driven by
 * JS, running on the phone UI) and `RotoCarSession`/`NavigationScreen` (driven by the car host,
 * running in the same process on a different "screen") both need the latest trip state, but
 * neither owns the other and there is no shared ViewModel scope between a React Native activity
 * and a CarAppService. A plain in-memory object is enough because trip state only needs to
 * survive as long as the process does - if the app is killed mid-ride the phone side re-sends
 * `startNavigation`+`updateTrip` on the next navigator tick anyway. Upgrade to something
 * persisted only if a future feature needs car-side state to survive a process death.
 */
object RotoCarStore {
  @Volatile
  var trip: RotoCarTrip? = null
    private set

  @Volatile
  var connected: Boolean = false
    private set

  /**
   * Bumped on every `startTrip`/`stopTrip` so the map renderer can tell "a different trip, recompute
   * the view scale" from "another update to the trip I am already drawing".
   */
  @Volatile
  var revision: Int = 0
    private set

  /** Set by whichever `NavigationScreen` is currently alive; called after every mutation below. */
  var onTripChanged: (() -> Unit)? = null

  /** Set by `RotoCarModule`; forwarded to JS as the `connected`/`disconnected` events. */
  var onConnectionChanged: ((Boolean) -> Unit)? = null

  /** Set by `RotoCarModule`; forwarded to JS as the `action` event. */
  var onAction: ((String) -> Unit)? = null

  @Synchronized
  fun startTrip(destinationName: String, destLat: Double?, destLon: Double?) {
    trip = RotoCarTrip(
      destinationName = destinationName,
      maneuverType = 0,
      instruction = "",
      distanceM = 0.0,
      street = null,
      remainingKm = 0.0,
      etaMin = 0,
      speedLimitKmh = null,
      lat = null,
      lon = null,
      path = emptyList(),
      destLat = destLat,
      destLon = destLon,
      mnvLat = null,
      mnvLon = null
    )
    revision += 1
    onTripChanged?.invoke()
  }

  @Synchronized
  fun updateTrip(update: TripUpdateRecord) {
    val previous = trip ?: return
    // The destination is whatever `startNavigation` said, or - for a caller that only ever calls
    // `updateTrip` - the last point of the polyline. The map surface has no other way to know where
    // the rider is going, and a reroute ends at the same place, so there is nothing to re-derive.
    val path = update.path ?: emptyList()
    val pathEndLat = if (path.size >= 4) path[path.size - 1] else null
    val pathEndLon = if (path.size >= 4) path[path.size - 2] else null
    trip = RotoCarTrip(
      destinationName = previous.destinationName,
      maneuverType = update.maneuverType,
      instruction = update.instruction,
      distanceM = update.distanceM,
      street = update.street,
      remainingKm = update.remainingKm,
      etaMin = update.etaMin,
      speedLimitKmh = update.speedLimitKmh,
      lat = update.lat,
      lon = update.lon,
      path = path,
      destLat = previous.destLat ?: pathEndLat,
      destLon = previous.destLon ?: pathEndLon,
      mnvLat = update.mnvLat,
      mnvLon = update.mnvLon
    )
    onTripChanged?.invoke()
  }

  @Synchronized
  fun stopTrip() {
    trip = null
    revision += 1
    onTripChanged?.invoke()
  }

  @Synchronized
  fun setConnected(value: Boolean) {
    connected = value
    onConnectionChanged?.invoke(value)
  }

  fun dispatchAction(id: String) {
    onAction?.invoke(id)
  }
}
