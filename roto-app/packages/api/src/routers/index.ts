import { protectedProcedure, publicProcedure, router } from "../index";
import { routeRouter } from "./route";
import { ridesRouter } from "./rides";
import { groupsRouter } from "./groups";
import { curatedRouter } from "./curated";
import { eventsRouter } from "./events";
import { privacyRouter } from "./privacy";
import { safetyRouter } from "./safety";
import { poisRouter } from "./pois";
import { hazardsRouter } from "./hazards";
import { holidaysRouter } from "./holidays";
import { fuelRouter } from "./fuel";
import { routesRouter } from "./routes";
import { communityRouter } from "./community";
import { challengesRouter } from "./challenges";
import { moderationRouter } from "./moderation";
import { garageRouter } from "./garage";
import { syncRouter } from "./sync";

export const appRouter = router({
  route: routeRouter,
  rides: ridesRouter,
  groups: groupsRouter,
  curated: curatedRouter,
  events: eventsRouter,
  privacy: privacyRouter,
  safety: safetyRouter,
  pois: poisRouter,
  hazards: hazardsRouter,
  holidays: holidaysRouter,
  fuel: fuelRouter,
  routes: routesRouter,
  community: communityRouter,
  challenges: challengesRouter,
  moderation: moderationRouter,
  garage: garageRouter,
  sync: syncRouter,
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
});
export type AppRouter = typeof appRouter;
