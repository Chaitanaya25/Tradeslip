import "server-only";
import { createHash } from "node:crypto";
import { rateLimitWindowStart } from "./plans";
import { createAdminClient } from "./supabase/admin";

/**
 * Fixed-window rate limits on the rate_limits table, via the service-role
 * `rate_limit_hit` function. Server only: callers must be public endpoints that
 * cannot use the signed-in user's client.
 */

export type RateLimitCheck = { subject: string; key: string; limit: number };

/** Counts one hit and returns the new count for (subject, key, window). */
export type RateLimitRpc = (subject: string, key: string, windowStart: string) => Promise<number | null>;

const adminRpc: RateLimitRpc = async (subject, key, windowStart) => {
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_ip: subject,
    p_key: key,
    p_window_start: windowStart,
  });
  return error || typeof data !== "number" ? null : data;
};

/** Subject for a signed-in user (rate limits on actions that cost money or send email). */
export const userSubject = (userId: string) => `user:${userId.slice(0, 64)}`;

/** Subject for an IP address. */
export const ipSubject = (ip: string) => `ip:${ip.slice(0, 64)}`;

/** Subject for a public token. The raw token is hashed, never stored in the table. */
export function tokenSubject(token: string): string {
  return `tok:${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
}

/** Best-effort client IP from proxy headers (first x-forwarded-for entry). */
export function clientIp(forwardedFor: string | null, realIp: string | null): string {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || realIp?.trim() || "unknown";
}

/**
 * Count one hit against every check. Allowed only if all are within their limit.
 * If the counter is unavailable the request is refused (fail closed).
 */
export async function checkRateLimits(
  checks: readonly RateLimitCheck[],
  options: { rpc?: RateLimitRpc; now?: Date; windowMs?: number } = {},
): Promise<{ allowed: boolean }> {
  const rpc = options.rpc ?? adminRpc;
  const windowStart = options.windowMs
    ? new Date(Math.floor((options.now ?? new Date()).getTime() / options.windowMs) * options.windowMs).toISOString()
    : rateLimitWindowStart(options.now);

  let allowed = true;
  for (const check of checks) {
    const count = await rpc(check.subject, check.key, windowStart);
    if (count === null || count > check.limit) allowed = false;
  }
  return { allowed };
}
