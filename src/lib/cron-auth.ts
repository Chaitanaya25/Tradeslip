import { createHash, timingSafeEqual } from "node:crypto";

export type CronAuth = "ok" | "unauthorized" | "misconfigured";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Check `Authorization: Bearer <CRON_SECRET>` in constant time (both sides are hashed to the same length
 * first, so neither the length nor the content of the secret can be probed by timing).
 * Missing or wrong -> "unauthorized". An unset secret in production -> "misconfigured" (the route refuses).
 * Outside production an unset secret also refuses: cron routes are never open.
 */
export function checkCronAuth(authorization: string | null, secret: string | undefined): CronAuth {
  const expected = secret?.trim();
  if (!expected || expected.length < 16) return "misconfigured";
  const match = /^Bearer (.+)$/.exec(authorization ?? "");
  if (!match) return "unauthorized";
  return timingSafeEqual(digest(match[1]), digest(expected)) ? "ok" : "unauthorized";
}
