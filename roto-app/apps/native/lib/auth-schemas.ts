// Auth form schemas for components/sign-in.tsx and components/sign-up.tsx.
//
// These stay at module scope rather than moving inside the components: @tanstack/react-form wants a
// stable `validators.onSubmit` identity, and a schema rebuilt on every render churns it. The cost is
// that a module-scope schema cannot close over `t`, which is how the messages shipped English-only.
//
// The fix is a message-id map instead of per-language schemas: the schema emits a stable id
// ("emailRequired"), and the screen translates it at render time with `isAuthMessageId`. Ids that the
// map does not know are server messages and pass through untouched, so this never mangles an API error.
// ponytail: one lookup table beats three schema copies and a language change re-creating the form.
import z from "zod";

/** Message ids emitted by the schemas below. Each must exist as a key in lib/i18n-native.ts. */
export type AuthMessageId =
  | "emailRequired"
  | "emailInvalid"
  | "passwordRequired"
  | "passwordMin"
  | "nameRequired"
  | "nameMin";

const AUTH_MESSAGE_IDS: Record<AuthMessageId, true> = {
  emailRequired: true,
  emailInvalid: true,
  passwordRequired: true,
  passwordMin: true,
  nameRequired: true,
  nameMin: true,
};

export function isAuthMessageId(value: string): value is AuthMessageId {
  return Object.prototype.hasOwnProperty.call(AUTH_MESSAGE_IDS, value);
}

export const signInSchema = z.object({
  email: z.string().trim().min(1, "emailRequired").email("emailInvalid"),
  password: z.string().min(1, "passwordRequired").min(8, "passwordMin"),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").min(2, "nameMin"),
  email: z.string().trim().min(1, "emailRequired").email("emailInvalid"),
  password: z.string().min(1, "passwordRequired").min(8, "passwordMin"),
});
