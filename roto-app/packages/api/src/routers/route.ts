import { z } from "zod";
import { publicProcedure, router } from "../index";
import { planRoute, roundTripPoints } from "../lib/routing";

const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });

export const routeRouter = router({
  plan: publicProcedure
    .input(z.object({ points: z.array(point).min(2).max(25), curvy: z.number().min(0).max(1).default(0.5) }))
    .query(({ input }) => planRoute(input.points, input.curvy)),
  roundTrip: publicProcedure
    .input(z.object({ center: point, km: z.number().min(5).max(600).default(60), curvy: z.number().min(0).max(1).default(0.7) }))
    .query(({ input }) => planRoute(roundTripPoints(input.center, input.km), input.curvy)),
});
