// Thin re-export of @roto-app/core/privacy (A1: web and native share one privacy-zone
// implementation, moved off apps/native's own copy of trimEnds/insideAny). Kept as a stable
// native import path — see packages/api/src/lib/routing.ts for the same re-export-shim pattern.
export { insideAny, maskInside, trimEnds } from "@roto-app/core/privacy";
export type { Zone } from "@roto-app/core/privacy";
