import { protectedProcedure, publicProcedure, router } from "../index";
import { routeRouter } from "./route";
import { ridesRouter } from "./rides";
import { groupsRouter } from "./groups";

export const appRouter = router({
  route: routeRouter,
  rides: ridesRouter,
  groups: groupsRouter,
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
