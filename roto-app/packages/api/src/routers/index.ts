import { protectedProcedure, publicProcedure, router } from "../index";
import { routeRouter } from "./route";
import { ridesRouter } from "./rides";
import { groupsRouter } from "./groups";
import { curatedRouter } from "./curated";
import { eventsRouter } from "./events";
import { privacyRouter } from "./privacy";

export const appRouter = router({
  route: routeRouter,
  rides: ridesRouter,
  groups: groupsRouter,
  curated: curatedRouter,
  events: eventsRouter,
  privacy: privacyRouter,
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
