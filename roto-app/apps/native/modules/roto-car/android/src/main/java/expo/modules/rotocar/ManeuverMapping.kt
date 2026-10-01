package expo.modules.rotocar

import androidx.car.app.navigation.model.Maneuver

/**
 * Maps a Valhalla `DirectionsLeg.Maneuver.Type` (int, 0-43 - see `valhalla/proto/directions.proto`
 * in the Valhalla source, or `packages/api/src/lib/routing/valhalla.ts` in this repo, which already
 * consumes the same field) to an androidx.car.app `Maneuver.TYPE_*` constant.
 *
 * androidx.car.app's set of maneuver types is coarser than Valhalla's in a few places (no distinct
 * "depart to the right/left", no separate on-ramp-straight, no ferry-exit), so several rows below
 * are a documented best-effort approximation rather than an exact match. None of this is safety
 * critical: the spoken/printed `instruction` string built in `core/maneuvers.ts` (plan §3.2, §4.3)
 * is what the rider actually reads/hears - this table only drives which turn *icon* the car's
 * NavigationTemplate shows next to that text.
 *
 * Sri Lanka drives on the left, so roundabouts are entered/exited clockwise - hence the CW (not
 * CCW) roundabout constants below.
 */
object ManeuverMapping {

  // Valhalla DirectionsLeg_Maneuver_Type values (kNone = 0 .. kBuildingExit = 43).
  private const val VALHALLA_NONE = 0
  private const val VALHALLA_START = 1
  private const val VALHALLA_START_RIGHT = 2
  private const val VALHALLA_START_LEFT = 3
  private const val VALHALLA_DESTINATION = 4
  private const val VALHALLA_DESTINATION_RIGHT = 5
  private const val VALHALLA_DESTINATION_LEFT = 6
  private const val VALHALLA_BECOMES = 7
  private const val VALHALLA_CONTINUE = 8
  private const val VALHALLA_SLIGHT_RIGHT = 9
  private const val VALHALLA_RIGHT = 10
  private const val VALHALLA_SHARP_RIGHT = 11
  private const val VALHALLA_UTURN_RIGHT = 12
  private const val VALHALLA_UTURN_LEFT = 13
  private const val VALHALLA_SHARP_LEFT = 14
  private const val VALHALLA_LEFT = 15
  private const val VALHALLA_SLIGHT_LEFT = 16
  private const val VALHALLA_RAMP_STRAIGHT = 17
  private const val VALHALLA_RAMP_RIGHT = 18
  private const val VALHALLA_RAMP_LEFT = 19
  private const val VALHALLA_EXIT_RIGHT = 20
  private const val VALHALLA_EXIT_LEFT = 21
  private const val VALHALLA_STAY_STRAIGHT = 22
  private const val VALHALLA_STAY_RIGHT = 23
  private const val VALHALLA_STAY_LEFT = 24
  private const val VALHALLA_MERGE = 25
  private const val VALHALLA_ROUNDABOUT_ENTER = 26
  private const val VALHALLA_ROUNDABOUT_EXIT = 27
  private const val VALHALLA_FERRY_ENTER = 28
  private const val VALHALLA_FERRY_EXIT = 29
  // 30-36: transit maneuvers (kTransit .. kPostTransitConnectionDestination). Never produced for
  // the "motorcycle" costing this app uses; mapped to TYPE_UNKNOWN below for completeness.
  private const val VALHALLA_TRANSIT_MIN = 30
  private const val VALHALLA_TRANSIT_MAX = 36
  private const val VALHALLA_MERGE_RIGHT = 37
  private const val VALHALLA_MERGE_LEFT = 38
  // 39-43: elevator/steps/escalator/building enter-exit. Pedestrian-only; never produced here.
  private const val VALHALLA_INDOOR_MIN = 39
  private const val VALHALLA_INDOOR_MAX = 43

  /**
   * @param valhallaType raw `maneuver.type` from a Valhalla `/route` or `/trace_route` response.
   * @return an androidx.car.app `Maneuver.TYPE_*` constant, defaulting to `TYPE_UNKNOWN` for
   *   anything unrecognised (a future Valhalla release adding a new type should degrade to a
   *   generic icon, not crash the car session).
   */
  fun toCarManeuverType(valhallaType: Int): Int = when (valhallaType) {
    VALHALLA_NONE -> Maneuver.TYPE_UNKNOWN
    // androidx has one TYPE_DEPART with no left/right variant.
    VALHALLA_START, VALHALLA_START_RIGHT, VALHALLA_START_LEFT -> Maneuver.TYPE_DEPART
    VALHALLA_DESTINATION -> Maneuver.TYPE_DESTINATION
    VALHALLA_DESTINATION_RIGHT -> Maneuver.TYPE_DESTINATION_RIGHT
    VALHALLA_DESTINATION_LEFT -> Maneuver.TYPE_DESTINATION_LEFT
    VALHALLA_BECOMES -> Maneuver.TYPE_NAME_CHANGE
    VALHALLA_CONTINUE -> Maneuver.TYPE_STRAIGHT
    VALHALLA_SLIGHT_RIGHT -> Maneuver.TYPE_TURN_SLIGHT_RIGHT
    VALHALLA_RIGHT -> Maneuver.TYPE_TURN_NORMAL_RIGHT
    VALHALLA_SHARP_RIGHT -> Maneuver.TYPE_TURN_SHARP_RIGHT
    VALHALLA_UTURN_RIGHT -> Maneuver.TYPE_U_TURN_RIGHT
    VALHALLA_UTURN_LEFT -> Maneuver.TYPE_U_TURN_LEFT
    VALHALLA_SHARP_LEFT -> Maneuver.TYPE_TURN_SHARP_LEFT
    VALHALLA_LEFT -> Maneuver.TYPE_TURN_NORMAL_LEFT
    VALHALLA_SLIGHT_LEFT -> Maneuver.TYPE_TURN_SLIGHT_LEFT
    // Approximation: androidx has no "ramp straight" icon; a straight arrow is the closest match.
    VALHALLA_RAMP_STRAIGHT -> Maneuver.TYPE_STRAIGHT
    // Approximation: Valhalla's generic "ramp" (could be on- or off-ramp) is treated as an on-ramp,
    // the more common case for a motorcycle route joining a bigger road.
    VALHALLA_RAMP_RIGHT -> Maneuver.TYPE_ON_RAMP_NORMAL_RIGHT
    VALHALLA_RAMP_LEFT -> Maneuver.TYPE_ON_RAMP_NORMAL_LEFT
    VALHALLA_EXIT_RIGHT -> Maneuver.TYPE_OFF_RAMP_NORMAL_RIGHT
    VALHALLA_EXIT_LEFT -> Maneuver.TYPE_OFF_RAMP_NORMAL_LEFT
    VALHALLA_STAY_STRAIGHT -> Maneuver.TYPE_STRAIGHT
    VALHALLA_STAY_RIGHT -> Maneuver.TYPE_KEEP_RIGHT
    VALHALLA_STAY_LEFT -> Maneuver.TYPE_KEEP_LEFT
    // Approximation: Valhalla doesn't say which side a generic merge is on; default to left.
    VALHALLA_MERGE -> Maneuver.TYPE_MERGE_LEFT
    VALHALLA_MERGE_RIGHT -> Maneuver.TYPE_MERGE_RIGHT
    VALHALLA_MERGE_LEFT -> Maneuver.TYPE_MERGE_LEFT
    // Sri Lanka drives on the left -> clockwise roundabouts.
    VALHALLA_ROUNDABOUT_ENTER -> Maneuver.TYPE_ROUNDABOUT_ENTER_CW
    VALHALLA_ROUNDABOUT_EXIT -> Maneuver.TYPE_ROUNDABOUT_EXIT_CW
    VALHALLA_FERRY_ENTER -> Maneuver.TYPE_FERRY_BOAT
    // Approximation: androidx has no "leaving the ferry" icon; straight is the closest match.
    VALHALLA_FERRY_EXIT -> Maneuver.TYPE_STRAIGHT
    in VALHALLA_TRANSIT_MIN..VALHALLA_TRANSIT_MAX -> Maneuver.TYPE_UNKNOWN
    in VALHALLA_INDOOR_MIN..VALHALLA_INDOOR_MAX -> Maneuver.TYPE_UNKNOWN
    else -> Maneuver.TYPE_UNKNOWN
  }
}
