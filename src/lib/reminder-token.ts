import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed unsubscribe links: base64url("businessId|email") + "." + HMAC-SHA256 (first 32 chars of
 * the base64url digest). The token proves the link was issued by us for that business and address;
 * it carries no secret beyond what the recipient already knows (their own address). It does not expire:
 * a reminder email may be opened weeks later.
 */

const MAC_LENGTH = 32;

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url").slice(0, MAC_LENGTH);

export function createUnsubscribeToken(businessId: string, email: string, secret: string): string {
  const payload = b64(`${businessId}|${email.trim().toLowerCase()}`);
  return `${payload}.${mac(payload, secret)}`;
}

export type UnsubscribeClaim = { businessId: string; email: string };

/** The business and address in a valid token, or null for anything malformed or tampered with. */
export function verifyUnsubscribeToken(token: unknown, secret: string): UnsubscribeClaim | null {
  if (typeof token !== "string" || token.length > 600 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [payload, given] = token.split(".");
  const expected = mac(payload, secret);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [businessId, email, ...rest] = Buffer.from(payload, "base64url").toString("utf8").split("|");
  if (rest.length > 0 || !businessId || !email) return null;
  if (!/^[0-9a-f-]{36}$/i.test(businessId) || !email.includes("@") || email.length > 254) return null;
  return { businessId, email };
}

const DEV_SECRET = "dev-only-unsubscribe-secret-do-not-use-in-production";
let warned = false;

/** The signing secret. Required in production (returns null so callers refuse); a clearly named fallback in development. */
export function resolveUnsubscribeSecret(env: { REMINDER_UNSUBSCRIBE_SECRET?: string; NODE_ENV?: string } = process.env): string | null {
  const value = env.REMINDER_UNSUBSCRIBE_SECRET?.trim();
  if (value && value.length >= 16) return value;
  if (env.NODE_ENV === "production") return null;
  if (!warned) {
    warned = true;
    console.warn("[reminders] REMINDER_UNSUBSCRIBE_SECRET is not set; using a development-only secret.");
  }
  return DEV_SECRET;
}
