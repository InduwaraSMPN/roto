package expo.modules.rotocar

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.car.app.AppManager
import androidx.car.app.CarContext
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

private const val TAG = "RotoCarMap"

/** Night-highway background. Matches `--background` in packages/ui/src/styles/globals.css. */
private const val BG = 0xFF0B0D10.toInt()

/** Faint schematic grid, one step darker than the background. */
private const val GRID = 0xFF1B1F26.toInt()

/** Text on the dark surface. The signal yellow itself is the only accent. */
private const val FG = 0xFFE8EAED.toInt()

/** DESIGN.md: text that sits on signal yellow. Used for marker outlines here. */
private const val INK = 0xFF1A1200.toInt()

/** Roto's one signal-yellow accent (DESIGN.md). */
private const val SIGNAL = 0xFFFFB300.toInt()

/** Smallest vertical field of view, in degrees (~330 m of latitude). Stops arrival zoom chaos. */
private const val MIN_HALF_LAT_DEG = 0.0015

/**
 * Draws Roto's route into the `Surface` the car host hands us, so `MapWithContentTemplate` shows a
 * map region instead of a blank panel.
 *
 * // ponytail: this is a *schematic* of the route, not a real map, and it has to be. A car head unit
 * (and the Desktop Head Unit) gives an app a bare `android.view.Surface` and no tile source: there
 * is no map SDK on the projection host, no network guarantee in a moving vehicle, and no place to
 * cache a raster tile pack that has to fit the car app's own APK budget. Every shipping Android Auto
 * nav app (Google Maps, Waze) instead ships its own vector renderer plus a tile pipeline. So v1 draws
 * the geometry it already has: the remaining polyline, the maneuver point with a direction arrow,
 * the destination and the rider - on a dark graticule, captioned `SCHEMATIC / NO MAP DATA` so a
 * rider can never mistake it for a street map. Upgrade path: a real `MapView`/MapLibre GL surface fed
 * by a streaming tile source, which is a large change (asset size, tile licence, per-host GL
 * quirks) and only worth it once the app is on a store with users who ask for it.
 *
 * Frame pacing: redraw only when something changed (surface acquired/destroyed, or JS pushed a trip
 * update), never on a timer. A car surface costs GPU time while the car is driving; a
 * 1 Hz animation loop that repaints identical pixels is the classic way to burn a head unit's
 * thermal budget for nothing.
 */
class RotoCarMapSurface(private val carContext: CarContext) {

  private val handler = Handler(Looper.getMainLooper())

  @Volatile
  private var container: SurfaceContainer? = null

  private var drawPending = false

  // View transform, cached per trip revision so the camera does not breathe between updates.
  private var cachedRevision = -1
  private var pxPerDegLat = 0.0
  private var lonCos = 1.0

  private val bgPaint = Paint().apply { color = BG; style = Paint.Style.FILL }
  private val gridPaint = Paint().apply {
    color = GRID
    style = Paint.Style.STROKE
    strokeWidth = 2f
  }
  private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = SIGNAL
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }
  private val casingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = BG
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
  }
  private val markerFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val markerStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
  }
  private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = FG
    style = Paint.Style.FILL
  }

  /** True once the host has handed us a usable surface, i.e. `MapWithContentTemplate` is safe. */
  val isAvailable: Boolean
    get() = container?.surface?.isValid == true

  /** Set by the screen so a surface that arrives after the last trip update re-renders the template. */
  var onSurfaceReady: (() -> Unit)? = null

  private val surfaceCallback = object : SurfaceCallback {
    override fun onSurfaceAvailable(surface: SurfaceContainer) {
      Log.i(TAG, "surface available: ${surface.width}x${surface.height} @${surface.dpi}dpi")
      container = surface
      cachedRevision = -1
      requestDraw()
      // The screen decides MapWithContentTemplate vs the text template, and it only asks once per
      // invalidate() - so tell it the world changed.
      onSurfaceReady?.invoke()
    }

    override fun onSurfaceDestroyed(surface: SurfaceContainer) {
      Log.i(TAG, "surface destroyed")
      if (container === surface) container = null
    }

    override fun onVisibleAreaChanged(visibleArea: Rect) {
      requestDraw()
    }
  }

  /** Registers the surface callback. Call while the screen is alive. */
  fun attach() {
    runCatching {
      carContext.getCarService(AppManager::class.java).setSurfaceCallback(surfaceCallback)
    }.onFailure { Log.w(TAG, "setSurfaceCallback failed, staying on the text template", it) }
  }

  /** Unregisters the callback and drops the surface so the host can reclaim it. */
  fun detach() {
    container = null
    runCatching {
      carContext.getCarService(AppManager::class.java).setSurfaceCallback(null)
    }
  }

  /** Coalesces bursts of trip updates into at most one repaint per main-loop pass. */
  fun requestDraw() {
    if (drawPending) return
    drawPending = true
    handler.post {
      drawPending = false
      draw()
    }
  }

  private fun draw() {
    val current = container ?: return
    // SurfaceContainer.getSurface() is @Nullable: a host can hand over the container first and
    // the surface a moment later, or drop the surface while the container is still around.
    val surface = current.surface ?: return
    if (!surface.isValid) return
    val trip = RotoCarStore.trip
    if (trip == null || !trip.hasGeometry) return

    val canvas: Canvas = try {
      surface.lockHardwareCanvas()
    } catch (t: Throwable) {
      Log.w(TAG, "lockHardwareCanvas failed, falling back to a software canvas", t)
      try {
        // compileSdk 36 dropped the no-arg overload; a null dirty rect means "the whole surface".
        surface.lockCanvas(null)
      } catch (t2: Throwable) {
        Log.w(TAG, "lockCanvas failed, skipping this frame", t2)
        return
      }
    }

    try {
      render(canvas, trip, current.dpi)
    } catch (t: Throwable) {
      // A failed frame must never take the car session down.
      Log.e(TAG, "draw failed", t)
    } finally {
      try {
        surface.unlockCanvasAndPost(canvas)
      } catch (t: Throwable) {
        Log.w(TAG, "unlockCanvasAndPost failed", t)
      }
    }
  }

  private fun render(canvas: Canvas, trip: RotoCarTrip, dpi: Int) {
    val w = canvas.width.toFloat()
    val h = canvas.height.toFloat()
    if (w <= 0f || h <= 0f) return

    canvas.drawRect(0f, 0f, w, h, bgPaint)

    val pad = min(w, h) * 0.08f
    val usableW = w - 2 * pad
    val usableH = h - 2 * pad
    if (usableW <= 0f || usableH <= 0f) return

    val path = trip.path
    // Bounds of everything worth showing: the remaining polyline, the rider and the destination.
    var minLat = Double.MAX_VALUE
    var maxLat = -Double.MAX_VALUE
    var minLon = Double.MAX_VALUE
    var maxLon = -Double.MAX_VALUE
    var i = 0
    while (i + 1 < path.size) {
      val lon = path[i]
      val lat = path[i + 1]
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      i += 2
    }
    val lat = trip.lat ?: 0.0
    val lon = trip.lon ?: 0.0
    if (path.size < 4) {
      minLat = lat
      maxLat = lat
      minLon = lon
      maxLon = lon
    }
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon

    val midLatRad = Math.toRadians((minLat + maxLat) / 2.0)
    val neededCos = max(cos(midLatRad), 0.05)
    val latSpan = max(maxLat - minLat, MIN_HALF_LAT_DEG * 2.0)
    val lonSpan = max((maxLon - minLon) * neededCos, MIN_HALF_LAT_DEG * 2.0)
    val neededK = min(usableW / lonSpan, usableH / latSpan).toDouble()

    // ponytail: the scale is recomputed per trip (RotoCarStore.revision) and only ever grows, so a
    // longer reroute widens the view instead of the camera jumping frame to frame. A real map would
    // smooth-zoom and follow the rider instead.
    if (cachedRevision != RotoCarStore.revision || pxPerDegLat <= 0.0) {
      cachedRevision = RotoCarStore.revision
      pxPerDegLat = neededK
    } else {
      pxPerDegLat = max(pxPerDegLat, neededK)
    }
    // The longitude squash is recomputed every frame: it depends on where the route is, and it
    // changes too slowly to be worth caching.
    lonCos = neededCos
    val k = pxPerDegLat
    val c = lonCos

    // Centre on the midpoint of what is left, at the frozen scale: a slow forward creep rather
    // than a re-fit that would zoom in every time the tail of the route is trimmed off.
    val centerLat = (minLat + maxLat) / 2.0
    val centerLon = (minLon + maxLon) / 2.0

    fun px(lonDeg: Double): Float = (w / 2f + ((lonDeg - centerLon) * c * k)).toFloat()
    fun py(latDeg: Double): Float = (h / 2f - (latDeg - centerLat) * k).toFloat()

    drawGrid(canvas, w, h, centerLat, centerLon, k, c, usableW, usableH)

    val lineW = max(4f, w / 90f)
    linePaint.strokeWidth = lineW
    casingPaint.strokeWidth = lineW * 2.4f

    if (path.size >= 4) {
      val p = Path()
      var k2 = 0
      p.moveTo(px(path[k2]), py(path[k2 + 1]))
      k2 += 2
      while (k2 + 1 < path.size) {
        p.lineTo(px(path[k2]), py(path[k2 + 1]))
        k2 += 2
      }
      canvas.drawPath(p, casingPaint)
      canvas.drawPath(p, linePaint)
    }

    // Rider dot, then the maneuver point and a direction arrow from the rider towards it, then the
    // destination on top - so the arrow is never hidden by the rider's own marker.
    val riderX = px(lon)
    val riderY = py(lat)
    val mnvX = trip.mnvLon?.let { px(it) }
    val mnvY = trip.mnvLat?.let { py(it) }
    if (mnvX != null && mnvY != null) {
      drawArrow(canvas, riderX, riderY, mnvX, mnvY, lineW)
    }
    drawDot(canvas, riderX, riderY, lineW * 2.1f, FG)

    if (mnvX != null && mnvY != null) {
      drawDot(canvas, mnvX, mnvY, lineW * 2.4f, SIGNAL, inkRing = true)
    }

    val destLat = trip.destLat
    val destLon = trip.destLon
    if (destLat != null && destLon != null) {
      drawDestination(canvas, px(destLon), py(destLat), lineW * 2.4f)
    }

    val label = labelPaint.textSize
    labelPaint.textSize = 11f * max(1f, dpi / 160f)
    labelPaint.textAlign = Paint.Align.LEFT
    canvas.drawText("SCHEMATIC - NO MAP DATA", pad, h - pad * 0.5f, labelPaint)
    labelPaint.textAlign = Paint.Align.RIGHT
    canvas.drawText("(c) OpenStreetMap contributors", w - pad, h - pad * 0.5f, labelPaint)
    labelPaint.textSize = label
  }

  private fun drawGrid(
    canvas: Canvas,
    w: Float,
    h: Float,
    centerLat: Double,
    centerLon: Double,
    k: Double,
    c: Double,
    usableW: Float,
    usableH: Float
  ) {
    // One graticule line per ~1/6 of the visible span, snapped to a 1/2/5 x 10^n step.
    val visibleDeg = max(usableH / k.toFloat(), 1e-6f).toDouble()
    val raw = visibleDeg / 6.0
    val mag = Math.pow(10.0, Math.floor(Math.log10(max(raw, 1e-9))))
    val norm = raw / mag
    val step = (if (norm < 1.5) 1.0 else if (norm < 3.5) 2.0 else if (norm < 7.5) 5.0 else 10.0) * mag
    if (step <= 0.0) return

    var lat = Math.floor(centerLat / step) * step
    var guard = 0
    while (lat <= centerLat + visibleDeg && guard < 64) {
      val y = (h / 2f - (lat - centerLat) * k).toFloat()
      if (y > 0f && y < h) canvas.drawLine(0f, y, w, y, gridPaint)
      lat += step
      guard++
    }
    var lon = Math.floor(centerLon / step) * step
    val lonStep = step / c
    guard = 0
    while (lon <= centerLon + (usableW / k.toFloat()).toDouble() / c && guard < 64) {
      val x = (w / 2f + (lon - centerLon) * c * k).toFloat()
      if (x > 0f && x < w) canvas.drawLine(x, 0f, x, h, gridPaint)
      lon += lonStep
      guard++
    }
  }

  private fun drawArrow(canvas: Canvas, x0: Float, y0: Float, x1: Float, y1: Float, lineW: Float) {
    val dx = x1 - x0
    val dy = y1 - y0
    val len = sqrt(dx * dx + dy * dy)
    if (len < lineW * 3f) return
    val ux = dx / len
    val uy = dy / len
    // Stop short of the marker so the shaft never pokes through it.
    val tipX = x1 - ux * lineW * 2.6f
    val tipY = y1 - uy * lineW * 2.6f
    val tailX = x0 + ux * lineW * 2.4f
    val tailY = y0 + uy * lineW * 2.4f

    markerStroke.color = BG
    markerStroke.strokeWidth = lineW * 0.9f
    canvas.drawLine(tailX, tailY, tipX, tipY, markerStroke)
    markerStroke.color = SIGNAL
    markerStroke.strokeWidth = lineW * 0.45f
    canvas.drawLine(tailX, tailY, tipX, tipY, markerStroke)

    val head = lineW * 3.2f
    val nx = -uy
    val ny = ux
    val arrow = Path().apply {
      moveTo(tipX, tipY)
      lineTo(tipX - ux * head + nx * head * 0.55f, tipY - uy * head + ny * head * 0.55f)
      lineTo(tipX - ux * head - nx * head * 0.55f, tipY - uy * head - ny * head * 0.55f)
      close()
    }
    markerFill.color = SIGNAL
    canvas.drawPath(arrow, markerFill)
  }

  private fun drawDot(canvas: Canvas, x: Float, y: Float, r: Float, color: Int, inkRing: Boolean = false) {
    markerFill.color = color
    canvas.drawCircle(x, y, r, markerFill)
    markerStroke.color = if (inkRing) INK else BG
    markerStroke.strokeWidth = r * 0.28f
    canvas.drawCircle(x, y, r, markerStroke)
  }

  /** A stroked diamond: the universal "you are going here" mark, and unlike a pin it needs no bitmap. */
  private fun drawDestination(canvas: Canvas, x: Float, y: Float, r: Float) {
    val d = Path().apply {
      moveTo(x, y - r)
      lineTo(x + r, y)
      lineTo(x, y + r)
      lineTo(x - r, y)
      close()
    }
    markerFill.color = BG
    canvas.drawPath(d, markerFill)
    markerStroke.color = FG
    markerStroke.strokeWidth = r * 0.3f
    canvas.drawPath(d, markerStroke)
    markerFill.color = SIGNAL
    canvas.drawCircle(x, y, r * 0.26f, markerFill)
  }
}
