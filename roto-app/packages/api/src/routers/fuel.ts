// Ceypetco fuel prices (plan §5.2). Reads are public (shown on fuel POIs and home);
// writes are admin-only via the web admin page. There is no transformer (no superjson):
// `effectiveFrom` arrives at clients as an ISO string.
// ponytail: `current` without a fuelType picks the latest row per type in JS — the table
// holds one row per revision (monthly), so this stays a handful of rows; move to
// DISTINCT ON when a scraper writes daily.
import { fuelPrices } from "@roto-app/db/schema/fuel";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";

const FUEL_TYPES = ["petrol92", "petrol95", "diesel", "superDiesel", "kerosene"] as const;

export const fuelRouter = router({
  current: publicProcedure
    .input(z.object({ fuelType: z.enum(FUEL_TYPES).optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      if (input.fuelType) {
        const [row] = await ctx.db
          .select()
          .from(fuelPrices)
          .where(and(eq(fuelPrices.fuelType, input.fuelType), lte(fuelPrices.effectiveFrom, now)))
          .orderBy(desc(fuelPrices.effectiveFrom))
          .limit(1);
        return row ?? null;
      }
      const rows = await ctx.db
        .select()
        .from(fuelPrices)
        .where(lte(fuelPrices.effectiveFrom, now))
        .orderBy(desc(fuelPrices.effectiveFrom));
      const latest = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        if (!latest.has(row.fuelType)) latest.set(row.fuelType, row);
      }
      return Object.fromEntries(latest);
    }),

  history: publicProcedure
    .input(
      z.object({
        fuelType: z.enum(FUEL_TYPES),
        limit: z.number().int().positive().max(100).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(fuelPrices)
        .where(eq(fuelPrices.fuelType, input.fuelType))
        .orderBy(desc(fuelPrices.effectiveFrom))
        .limit(input.limit);
    }),

  set: protectedProcedure
    .input(
      z.object({
        fuelType: z.enum(FUEL_TYPES),
        priceLkr: z.number().positive().max(100000),
        effectiveFrom: z.coerce.date().optional(),
        source: z.string().max(120).default("manual"),
        sourceUrl: z.string().url().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if ((ctx.session.user as any).role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
      }
      const [row] = await ctx.db
        .insert(fuelPrices)
        .values({
          fuelType: input.fuelType,
          priceLkr: input.priceLkr,
          effectiveFrom: input.effectiveFrom ?? new Date(),
          source: input.source,
          sourceUrl: input.sourceUrl ?? null,
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "price insert failed" });
      return row;
    }),
});
