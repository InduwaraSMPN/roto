import { liveTrips, pushTokens, sosEvents } from "@roto-app/db/schema/safety";
import { sosContacts } from "@roto-app/db/schema/rides";
import { user } from "@roto-app/db/schema/auth";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@roto-app/db";
import { protectedProcedure, publicProcedure, router } from "../index";
import { sendEmail } from "../lib/email";
import { sendPush } from "../lib/push";
import { sendSms, sosTextFor } from "../lib/sms";

// LK mobile numbers: local 07XXXXXXXX (10 digits) or already E.164 +947XXXXXXXX / 947XXXXXXXX.
export function normalizeLkPhone(input: string): string {
  const trimmed = input.trim().replace(/[\s-]/g, "");
  if (/^\+947\d{8}$/.test(trimmed)) return trimmed;
  if (/^947\d{8}$/.test(trimmed)) return `+${trimmed}`;
  if (/^07\d{8}$/.test(trimmed)) return `+94${trimmed.slice(1)}`;
  throw new TRPCError({ code: "BAD_REQUEST", message: "Expected a Sri Lankan number like 07XXXXXXXX or +947XXXXXXXX" });
}

// D3: link a contact to an existing Roto account by email only (user has no phone field yet)
async function linkedUserIdFor(db: Database, email: string | undefined): Promise<string | null> {
  if (!email) return null;
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase())).limit(1);
  return rows[0]?.id ?? null;
}

const contactInput = z.object({
  name: z.string().min(1).max(80),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  relation: z.string().max(40).optional(),
  lang: z.enum(["en", "si", "ta"]).default("en"),
});

// Shared with rides.addSos/sosList (kept as one-release aliases per feature-parity-plan §4.12)
export async function listContacts(db: Database, userId: string) {
  return db.select().from(sosContacts).where(eq(sosContacts.userId, userId)).orderBy(asc(sosContacts.sortOrder));
}

export async function addContact(db: Database, userId: string, input: z.infer<typeof contactInput>) {
  const phone = normalizeLkPhone(input.phone);
  const linkedUserId = await linkedUserIdFor(db, input.email);
  const existing = await db.select().from(sosContacts).where(eq(sosContacts.userId, userId));
  const [row] = await db
    .insert(sosContacts)
    .values({
      userId,
      name: input.name,
      phone,
      email: input.email ?? null,
      relation: input.relation ?? null,
      lang: input.lang,
      sortOrder: existing.length,
      linkedUserId,
    })
    .returning();
  return row;
}

const latLon = { lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) };

// ponytail: 5 alerts/hour/user — SOS must never be silently dropped for being "spammy", but an
// accidental pocket-loop calling trigger in a retry storm should not burn the free email quota.
async function checkTriggerRateLimit(db: Database, userId: string) {
  const since = new Date(Date.now() - 3600_000);
  const recent = await db
    .select({ id: sosEvents.id })
    .from(sosEvents)
    .where(and(eq(sosEvents.userId, userId), gt(sosEvents.createdAt, since)))
    .limit(6);
  if (recent.length >= 5) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "SOS rate limit — try again shortly" });
}

function liveUrlFor(token: string): string | null {
  // Read at call time (varlock leaves infra URLs empty; prod provides env directly).
  const base = process.env.PUBLIC_WEB_URL ?? process.env.EXPO_PUBLIC_WEB_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/t/${token}`;
}

export const safetyRouter = router({
  contacts: router({
    list: protectedProcedure.query(({ ctx }) => listContacts(ctx.db, ctx.session.user.id)),
    add: protectedProcedure.input(contactInput).mutation(({ ctx, input }) => addContact(ctx.db, ctx.session.user.id, input)),
    update: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().min(1).max(80).optional(),
          phone: z.string().min(1).optional(),
          email: z.string().email().nullable().optional(),
          relation: z.string().max(40).nullable().optional(),
          lang: z.enum(["en", "si", "ta"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...rest } = input;
        const patch: Partial<typeof sosContacts.$inferInsert> = { ...rest };
        if (rest.phone !== undefined) patch.phone = normalizeLkPhone(rest.phone);
        if (rest.email !== undefined) patch.linkedUserId = await linkedUserIdFor(ctx.db, rest.email ?? undefined);
        const [row] = await ctx.db
          .update(sosContacts)
          .set(patch)
          .where(and(eq(sosContacts.id, id), eq(sosContacts.userId, ctx.session.user.id)))
          .returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "unknown contact" });
        return row;
      }),
    remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
      await ctx.db.delete(sosContacts).where(and(eq(sosContacts.id, input.id), eq(sosContacts.userId, ctx.session.user.id)));
      return true;
    }),
    reorder: protectedProcedure.input(z.object({ ids: z.array(z.string()).min(1) })).mutation(async ({ ctx, input }) => {
      // ponytail: N small updates, contact lists are single-digit — not worth a bulk CASE statement
      for (const [sortOrder, id] of input.ids.entries()) {
        await ctx.db.update(sosContacts).set({ sortOrder }).where(and(eq(sosContacts.id, id), eq(sosContacts.userId, ctx.session.user.id)));
      }
      return true;
    }),
  }),
  registerPushToken: protectedProcedure
    .input(z.object({ token: z.string().min(1), platform: z.enum(["ios", "android"]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(pushTokens)
        .values({ userId: ctx.session.user.id, token: input.token, platform: input.platform, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [pushTokens.userId, pushTokens.token],
          set: { platform: input.platform, updatedAt: new Date() },
        });
      return true;
    }),

  // Live trip (§4.12): an unguessable token (128-bit) is the public URL for /t/[token].
  // Privacy zones are enforced on the device — pingTrip never receives in-zone fixes.
  startTrip: protectedProcedure
    .input(
      z.object({
        reason: z.enum(["manual", "crash", "checkin"]).default("manual"),
        ...latLon,
        speed: z.number().nonnegative().optional(),
        heading: z.number().min(0).max(360).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const token = crypto.randomUUID();
      const [trip] = await ctx.db
        .insert(liveTrips)
        .values({
          userId: ctx.session.user.id,
          token,
          lastLat: input.lat,
          lastLon: input.lon,
          lastSpeed: input.speed ?? null,
          lastHeading: input.heading ?? null,
          reason: input.reason,
        })
        .returning();
      if (!trip) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "could not start trip" });
      return { id: trip.id, token: trip.token, url: liveUrlFor(trip.token) };
    }),
  pingTrip: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1),
        ...latLon,
        speed: z.number().nonnegative().optional(),
        heading: z.number().min(0).max(360).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [trip] = await ctx.db
        .select()
        .from(liveTrips)
        .where(and(eq(liveTrips.token, input.token), eq(liveTrips.userId, ctx.session.user.id)))
        .limit(1);
      if (!trip) throw new TRPCError({ code: "NOT_FOUND", message: "unknown trip" });
      if (trip.endedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "trip ended" });
      await ctx.db
        .update(liveTrips)
        .set({ lastLat: input.lat, lastLon: input.lon, lastSpeed: input.speed ?? null, lastHeading: input.heading ?? null, updatedAt: new Date() })
        .where(eq(liveTrips.id, trip.id));
      return true;
    }),
  endTrip: protectedProcedure.input(z.object({ token: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const [trip] = await ctx.db
      .select()
      .from(liveTrips)
      .where(and(eq(liveTrips.token, input.token), eq(liveTrips.userId, ctx.session.user.id)))
      .limit(1);
    if (!trip) throw new TRPCError({ code: "NOT_FOUND", message: "unknown trip" });
    await ctx.db.update(liveTrips).set({ endedAt: new Date() }).where(eq(liveTrips.id, trip.id));
    return true;
  }),
  // Public live page data (no account needed to view /t/[token]); expires 24h after the trip ends.
  tripByToken: publicProcedure.input(z.object({ token: z.string().min(1) })).query(async ({ ctx, input }) => {
    const [trip] = await ctx.db.select().from(liveTrips).where(eq(liveTrips.token, input.token)).limit(1);
    if (!trip) throw new TRPCError({ code: "NOT_FOUND", message: "unknown trip" });
    if (trip.endedAt && Date.now() - trip.endedAt.getTime() > 24 * 3600_000) {
      throw new TRPCError({ code: "NOT_FOUND", message: "trip expired" });
    }
    return {
      lat: trip.lastLat,
      lon: trip.lastLon,
      speed: trip.lastSpeed,
      heading: trip.lastHeading,
      updatedAt: trip.updatedAt,
      startedAt: trip.startedAt,
      endedAt: trip.endedAt,
      reason: trip.reason,
    };
  }),

  // SOS trigger (§4.12, D3): push + email go out server-side on free channels; SMS is the
  // client-side composer fallback (sms.ts provider is `none` until a sponsored gateway exists),
  // so this returns per-contact prefilled texts for the phone to send.
  trigger: protectedProcedure
    .input(
      z.object({
        reason: z.enum(["crash", "manual", "checkin"]),
        ...latLon,
        tripToken: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkTriggerRateLimit(ctx.db, ctx.session.user.id);

      let tripId: string | null = null;
      let liveToken: string | null = input.tripToken ?? null;
      if (liveToken) {
        const [trip] = await ctx.db
          .select()
          .from(liveTrips)
          .where(and(eq(liveTrips.token, liveToken), eq(liveTrips.userId, ctx.session.user.id)))
          .limit(1);
        if (trip) {
          tripId = trip.id;
          await ctx.db
            .update(liveTrips)
            .set({ lastLat: input.lat, lastLon: input.lon, updatedAt: new Date() })
            .where(eq(liveTrips.id, trip.id));
        } else {
          liveToken = null;
        }
      }
      if (!liveToken) {
        // No active trip (e.g. crash before manual start) — open one so contacts get a live link.
        const token = crypto.randomUUID();
        const [trip] = await ctx.db
          .insert(liveTrips)
          .values({ userId: ctx.session.user.id, token, lastLat: input.lat, lastLon: input.lon, reason: input.reason })
          .returning();
        if (trip) {
          tripId = trip.id;
          liveToken = trip.token;
        }
      }
      const liveUrl = liveToken ? liveUrlFor(liveToken) : null;
      const mapsUrl = `https://maps.google.com/?q=${input.lat},${input.lon}`;
      const link = liveUrl ?? mapsUrl;

      const me = await ctx.db.select({ name: user.name }).from(user).where(eq(user.id, ctx.session.user.id)).limit(1);
      const riderName = me[0]?.name || "A Roto rider";

      const [event] = await ctx.db
        .insert(sosEvents)
        .values({ userId: ctx.session.user.id, tripId, reason: input.reason, lat: input.lat, lon: input.lon })
        .returning();
      if (!event) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "could not record SOS" });

      const contacts = await listContacts(ctx.db, ctx.session.user.id);
      const linkedIds = contacts.map((c) => c.linkedUserId).filter((id): id is string => !!id);
      let tokens: { token: string }[] = [];
      if (linkedIds.length) {
        tokens = await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(inArray(pushTokens.userId, linkedIds));
      }
      const pushTitle = input.reason === "checkin" ? `Check-in from ${riderName}` : `SOS from ${riderName}`;
      const pushBody = `${pushTitle}. Live location: ${link}`;
      const push = await sendPush(tokens.map((t) => ({ token: t.token, title: pushTitle, body: pushBody, data: { eventId: event.id } })));

      const emailTo = contacts.map((c) => c.email).filter((e): e is string => !!e);
      const email = await sendEmail(emailTo, pushTitle, `${pushBody}\n\nGoogle Maps: ${mapsUrl}`);

      // D3: server SMS gateway not configured — phone sends these via the SMS composer.
      const sms = await sendSms([], "");
      const smsTexts = contacts.map((c) => ({ phone: c.phone, text: sosTextFor(c.lang ?? "en", riderName, link) }));

      const channels = { push, email, sms: sms.provider };
      await ctx.db.update(sosEvents).set({ channels }).where(eq(sosEvents.id, event.id));
      return { eventId: event.id, liveUrl: link, smsTexts, channels };
    }),

  resolve: protectedProcedure.input(z.object({ eventId: z.string() })).mutation(async ({ ctx, input }) => {
    const [event] = await ctx.db
      .select()
      .from(sosEvents)
      .where(and(eq(sosEvents.id, input.eventId), eq(sosEvents.userId, ctx.session.user.id)))
      .limit(1);
    if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "unknown SOS event" });
    await ctx.db.update(sosEvents).set({ resolvedAt: new Date() }).where(eq(sosEvents.id, event.id));
    // Best-effort "I'm OK" follow-up on the same free channels (never throws the resolve away).
    try {
      const contacts = await listContacts(ctx.db, ctx.session.user.id);
      const linkedIds = contacts.map((c) => c.linkedUserId).filter((id): id is string => !!id);
      if (linkedIds.length) {
        const tokens = await ctx.db.select({ token: pushTokens.token }).from(pushTokens).where(inArray(pushTokens.userId, linkedIds));
        await sendPush(tokens.map((t) => ({ token: t.token, title: "Rider is OK", body: "The rider marked their SOS as resolved.", data: { eventId: event.id } })));
      }
      const emailTo = contacts.map((c) => c.email).filter((e): e is string => !!e);
      await sendEmail(emailTo, "Rider is OK", "The rider marked their SOS as resolved.");
    } catch {
      // resolve still counts — the follow-up is best effort
    }
    return true;
  }),
});
