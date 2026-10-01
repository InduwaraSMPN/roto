// Thin re-export of @roto-app/core (A1). The old regex-only `parseGpxTrack` (tracks only, no
// waypoints, no KML/KMZ/ITN/TCX support) is gone — `importRouteFile` handles every format the
// core importer supports, used from map.tsx's import sheet with the new expo-file-system `File`
// API (`new File(uri).bytes()`) instead of `readAsStringAsync`.
export { coordsToGpx, toGpx } from "@roto-app/core/gpx";
export { importRouteFile } from "@roto-app/core/import";
export type { GpxPoint, GpxWaypoint, ToGpxOptions } from "@roto-app/core/gpx";
export type { ImportedRoute } from "@roto-app/core/import";
