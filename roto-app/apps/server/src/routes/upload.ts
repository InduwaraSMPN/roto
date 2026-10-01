import { ridePhotos, rides } from "@roto-app/db/schema/rides";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { auth, getDb } from "../services";

// ponytail: client-direct uploads via @vercel/blob handleUpload (plan §4.10).
// The phone/browser gets a short-lived token here, uploads bytes straight to
// Blob storage, and onUploadCompleted pins the URL into ride_photos. EXIF GPS
// is read on the client (expo-image-picker exif:true) and arrives as metadata.

const MAX_BYTES = 10 * 1024 * 1024;
const CAPTION_MAX = 280;

type PhotoMeta = {
  rideId?: string;
  userId?: string;
  lat?: number;
  lon?: number;
  takenAt?: string;
  caption?: string;
};

class UploadError extends Error {
  constructor(
    public status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function parseMeta(raw: string | null): PhotoMeta {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const p = parsed as Record<string, unknown>;
  const meta: PhotoMeta = {};
  if (typeof p.rideId === "string" && p.rideId) meta.rideId = p.rideId;
  // ponytail: userId round-trips through our own tokenPayload (set in
  // onBeforeGenerateToken). Compared against the live session, so client
  // tampering fails closed in onUploadCompleted.
  if (typeof p.userId === "string" && p.userId) meta.userId = p.userId;
  const lat = num(p.lat);
  if (lat !== undefined && lat >= -90 && lat <= 90) meta.lat = lat;
  const lon = num(p.lon);
  if (lon !== undefined && lon >= -180 && lon <= 180) meta.lon = lon;
  if (typeof p.takenAt === "string" || typeof p.takenAt === "number") {
    const d = new Date(p.takenAt);
    if (!Number.isNaN(d.getTime())) meta.takenAt = d.toISOString();
  }
  if (typeof p.caption === "string") {
    const caption = p.caption.trim().slice(0, CAPTION_MAX);
    if (caption) meta.caption = caption;
  }
  return meta;
}

async function assertOwnRide(rideId: string, userId: string): Promise<void> {
  const rows = await getDb()
    .select({ id: rides.id, userId: rides.userId })
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);
  const ride = rows[0];
  if (!ride) throw new UploadError(404, "ride not found");
  if (ride.userId !== userId) throw new UploadError(403, "not your ride");
}

export const uploadRoutes = new Hono();

uploadRoutes.post("/", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: "unauthorized" }, 401);

  // ponytail: BLOB_READ_WRITE_TOKEN is read here (call time), never at module
  // init. Unset (local dev without Blob) → explicit 503, not a crash.
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return c.json({ error: "upload-unavailable" }, 503);

  let body: HandleUploadBody;
  try {
    body = (await c.req.json()) as HandleUploadBody;
  } catch {
    return c.json({ error: "bad-request" }, 400);
  }

  const userId = session.user.id;
  try {
    const result = await handleUpload({
      token,
      request: c.req.raw,
      body,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const meta = parseMeta(clientPayload);
        if (!meta.rideId) throw new UploadError(400, "rideId required");
        await assertOwnRide(meta.rideId, userId);
        return {
          allowedContentTypes: ["image/*"],
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ ...meta, userId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const meta = parseMeta(tokenPayload ?? null);
        // ponytail: re-verify ownership at completion — the ride may have been
        // deleted between token issue and upload finish. Swallow 404/403 after
        // logging (blob is already stored; erroring would trigger Blob retries
        // that can never succeed).
        try {
          if (!meta.rideId || meta.userId !== userId) {
            throw new UploadError(403, "not your ride");
          }
          await assertOwnRide(meta.rideId, userId);
        } catch (error) {
          if (error instanceof UploadError) {
            console.warn(`upload completed for unknown/forbidden ride ${meta.rideId ?? "?"}`);
            return;
          }
          throw error;
        }
        await getDb()
          .insert(ridePhotos)
          .values({
            rideId: meta.rideId,
            userId,
            url: blob.url,
            ...(meta.lat !== undefined ? { lat: meta.lat } : {}),
            ...(meta.lon !== undefined ? { lon: meta.lon } : {}),
            ...(meta.takenAt ? { takenAt: new Date(meta.takenAt) } : {}),
            ...(meta.caption ? { caption: meta.caption } : {}),
          });
      },
    });
    return c.json(result);
  } catch (error) {
    if (error instanceof UploadError) return c.json({ error: error.message }, error.status);
    // ponytail: never log the token or request body — message only, no secrets.
    console.error(`POST /upload failed: ${error instanceof Error ? error.message : "unknown"}`);
    return c.json({ error: "upload-failed" }, 500);
  }
});
