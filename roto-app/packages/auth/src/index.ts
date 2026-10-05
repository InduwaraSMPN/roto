import { expo } from "@better-auth/expo";
import type { Database } from "@roto-app/db";
import * as schema from "@roto-app/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { username } from "better-auth/plugins/username";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [
      env.CORS_ORIGIN,
      ...desktopOrigins,
      "roto-app://",
      "exp://",
      "http://localhost:8081",
    ],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    // ponytail: organization/admin/username tables + user.username column land in
    // migration 0014 (parallel agent owns packages/db schema). Until it is applied,
    // org/admin/username endpoints will 500 at the DB layer — auth itself still boots.
    // Organization metadata.kind is 'club' | 'brand' (plan §4.16); clients must add
    // organizationClient()/usernameClient()/adminClient() (see server return notes).
    plugins: [
      expo(),
      organization({ teams: { enabled: true } }),
      admin(),
      username(),
    ],
  });
}
