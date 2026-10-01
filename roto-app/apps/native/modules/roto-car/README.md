# roto-car

Local Expo module: Android Auto integration for Roto, built on the
[Android for Cars App Library](https://developer.android.com/training/cars/apps/library)
(`androidx.car.app:app:1.7.0`). Android only (plan decision D15 - no CarPlay, no iOS code).

v1 shows `MapWithContentTemplate`: Roto draws the remaining route into the `Surface` the head unit
hands it (route polyline, maneuver marker + direction arrow, destination, rider dot) and the
`NavigationTemplate` with maneuver icon, street, distance and ETA sits beside it as the content
pane, with a Stop / Repeat / SOS action strip. If the host gives us no surface - or JS sends no
geometry - it falls back to the text-only `NavigationTemplate`, exactly as before. The map is a
**schematic**, captioned `SCHEMATIC - NO MAP DATA` on screen: see "What the DHU shows" below for why
a car host gives an app a surface but no map tiles.

## Changelog

- **2026-09-28** Map surface added (`RotoCarMapSurface.kt`): `AppManager.setSurfaceCallback` +
  `SurfaceContainer` + a Canvas renderer, and `NavigationScreen` now serves
  `MapWithContentTemplate` whenever a live surface and trip geometry are both present. JS API grew
  optional fields only - `startNavigation({ destLat, destLon })` and `updateTrip({ lat, lon, path,
  mnvLat, mnvLon })` - so a caller that sends nothing but the original seven fields still gets the
  old text template. `RotoCarStore` gained a `revision` counter so the renderer can cache the view
  scale per trip, and `plugin/with-roto-car.js` needed no new manifest entries - it already
  requested `androidx.car.app.ACCESS_SURFACE`.
  `lib/use-navigation.ts` now sends a route polyline decimated to 240 points per tick.

## What's in this module

```
modules/roto-car/
  index.ts                    JS API (isAvailable/isConnected/startNavigation/updateTrip/stopNavigation/addListener)
  expo-module.config.json     Android-only module registration for Expo Autolinking
  app.plugin.js               entry point Expo's config-plugin resolver looks for
  plugin/with-roto-car.js     manifest + automotive_app_desc.xml config plugin
  android/
    build.gradle
    src/main/AndroidManifest.xml        (empty; the real manifest changes are in the app, via the plugin)
    src/main/java/expo/modules/rotocar/
      RotoCarModule.kt        Expo module: JS <-> RotoCarStore bridge, fires connected/disconnected/action
      RotoCarStore.kt         process-wide singleton trip state shared between the module and the car session
      RotoCarAppService.kt    CarAppService entry point, host validation
      RotoCarSession.kt       one per car connection; wires NavigationManagerCallback
      NavigationScreen.kt     the only screen: MapWithContentTemplate (or the text NavigationTemplate
                              when there is no surface) and the "open your phone" message
      RotoCarMapSurface.kt    draws the route into the host's Surface: schematic, no map tiles
      ManeuverMapping.kt      Valhalla maneuver.type -> androidx Maneuver.TYPE_* table
```

## Integration steps (not done by this module - it only owns files under `modules/roto-car/`)

1. **app.json** (owned by another workstream): add the plugin and the two extra permissions it
   needs are already added by the plugin itself, so app.json only needs:
   ```json
   {
     "expo": {
       "plugins": ["./modules/roto-car/app.plugin.js"]
     }
   }
   ```
   Then run `npx expo prebuild --platform android` (or `npx expo run:android`, which prebuilds
   first) so the plugin regenerates `android/app/src/main/AndroidManifest.xml` and
   `android/app/src/main/res/xml/automotive_app_desc.xml`. Autolinking picks up this module
   automatically because it lives under the default `modules/` search path
   (`apps/native/package.json` would need `expo.autolinking.nativeModulesDir` only if that default
   ever changes).

2. **`apps/native/lib/use-navigation.ts`** (built): imports from `@/modules/roto-car` and, whenever
   `isConnected()` is true (or on the `connected` event), calls `startNavigation({ destinationName,
   destLat, destLon })` once per trip and `updateTrip({...})` on every navigator tick, mapping the
   app's own `Maneuver` type (already Valhalla-shaped, per `packages/core/src/types.ts`) straight
   through as `maneuverType` - the native side does the Valhalla -> androidx translation, not JS.
   Call `stopNavigation()` on arrival/cancel. Subscribe to the `action` event and route `'stop'` to
   whatever cancels navigation, `'repeat'` to re-speaking the current instruction via
   `lib/voice.ts`, and `'sos'` to `sosFlow()` (plan §4.12) - this module intentionally has no SOS
   logic of its own, it only reports the button press. The route geometry the map needs
   (`lat`/`lon`/`path`/`mnvLat`/`mnvLon`) is optional: if you only send the original seven fields the
   head unit shows the text template, which is a supported mode, not a failure.

3. Everything degrades safely if step 1/2 haven't happened yet: `isAvailable()` returns `false`
   on iOS/web or a dev client built before this module existed, and every other export is a no-op
   in that case - see `index.ts`.

## Testing with the Desktop Head Unit (DHU)

The DHU emulates a car head unit talking to a phone (or emulator) over `adb`. No real Android Auto
head unit or car is needed for development.

1. Install "Android Auto Desktop Head Unit Emulator" from the Android Studio SDK Manager -> SDK
   Tools (per `context/handoff.md`, this was not yet installed on the dev machine as of the last
   handoff; there is no `cmdline-tools`-based way to script this on Windows, it has to be the SDK
   Manager UI). It installs to `%ANDROID_HOME%\extras\google\auto\`.
2. On the phone/emulator running the dev build: Settings -> System -> About phone -> tap "Build
   number" 7 times to unlock Developer options, then open Android Auto's own hidden menu (tap the
   Android Auto version number in its app info / about screen 10 times), and enable **"Unknown
   sources"** and **"Start head unit server"** in Android Auto's developer settings.
3. From a terminal (PowerShell), with the device connected over `adb`:
   ```powershell
   adb forward tcp:5277 tcp:5277
   & "$env:ANDROID_HOME\extras\google\auto\desktop-head-unit.exe"
   ```
4. Launch Roto's dev build on the phone once so `RotoCarAppService` is registered, then the DHU
   window should show the Roto icon in its app list once a trip is running, or immediately if you
   want to check the idle "Open Roto on your phone to start" screen.
5. Filter logs with the module's tag: `adb logcat -s RotoCar`.

In debug builds, `RotoCarAppService.createHostValidator()` allows any host to connect (the DHU has
no production signature), so no extra allowlist setup is needed for this flow. Release builds
restrict to hosts covered by `androidx.car.app`'s own bundled `hosts_allowlist_sample` resource
(Google's Android Auto / Android Automotive host certificates) - see the comment on
`createHostValidator()` in `RotoCarAppService.kt`.

## What the DHU shows

Once a trip is running and the DHU has called `SurfaceCallback.onSurfaceAvailable`
(`adb logcat -s RotoCarMap` prints `surface available: WxH @Ndpi`), the head unit shows:

- **Left/upper pane - the map region.** Near-black background (`#0B0D10`) with a faint graticule,
  the remaining route as a signal-yellow (`#FFB300`) polyline with a dark casing, a white rider dot,
  a signal-yellow maneuver dot with a yellow arrow from the rider to it, and a white-outlined
  diamond at the destination. Bottom-left: `SCHEMATIC - NO MAP DATA`; bottom-right:
  `(c) OpenStreetMap contributors`. It is a schematic of the route, not a street map, and the
  caption says so on purpose.
- **Right/lower pane - the content pane.** The unchanged `NavigationTemplate`: maneuver icon,
  instruction, street, distance to the maneuver, distance/ETA to the destination, and the
  Stop / Repeat / SOS action strip.

**Does a real map provider have to be added?** No - not for this to be a working car navigation
screen, and there is nowhere on the projection host to get one from. An Android Auto host hands a
third-party nav app a bare `android.view.Surface` and nothing else: no tile server, no
`MapView`/`SurfaceView` for a car, no guarantee of a network connection, and no room in a projected
app's APK for a raster tile pack. Every shipping Android Auto navigation app (Google Maps, Waze)
brings its own vector renderer and tile pipeline. So the honest v1 is a labelled schematic of the
geometry Roto already has, and that is what this module draws. Turning it into a real street map
means adding a map SDK plus a tile source (and a per-host GL decision) - a deliberate follow-up, not
a bug in what is here.

If the host never calls `onSurfaceAvailable` (an older head unit, or a DHU build without surface
support) the screen falls back to the text-only `NavigationTemplate` full width. That path is
deliberate: a blank half-screen would be worse than no map.

`androidx.car.app.USE_TEMPLATE_MANAGER` is deliberately **not** set. It is a flag for Android
Automotive OS system apps that manage their own templates; Roto is a projected Android Auto app
(D5), where the host owns the template manager and the surface callback is the supported route.

## Log tags

- `RotoCar` - session connect/disconnect, navigation start/end (`adb logcat -s RotoCar`).
- `RotoCarMap` - surface available/destroyed, canvas lock/draw failures (`adb logcat -s RotoCarMap`).
