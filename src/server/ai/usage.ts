import "server-only";
import { AI_DRAFTS_PER_MINUTE, rateLimitWindowStart } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Counters the signed-in user must not be able to write (usage_counters and
 * rate_limits have no owner policies). These use the service-role client, so call
 * them ONLY after the user, their business and the request have been verified.
 */

/** Count this request in the user's one-minute window. `allowed` is false once over the limit. */
export async function hitRateLimit(userId: string, now: Date = new Date()): Promise<{ allowed: boolean; count: number }> {
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_ip: `user:${userId}`,
    p_key: "ai-draft",
    p_window_start: rateLimitWindowStart(now),
  });
  // If the counter itself is unavailable, fail closed rather than allow unlimited AI calls.
  if (error || typeof data !== "number") return { allowed: false, count: 0 };
  return { allowed: data <= AI_DRAFTS_PER_MINUTE, count: data };
}

/** Atomically use one draft for the period. `ok` is false when the plan's monthly limit is reached. */
export async function reserveAiDraft(businessId: string, period: string, limit: number): Promise<{ ok: boolean; error?: boolean }> {
  const { data, error } = await createAdminClient().rpc("increment_ai_drafts", {
    p_business_id: businessId,
    p_period: period,
    p_limit: limit,
  });
  if (error) return { ok: false, error: true };
  return { ok: data !== null };
}

/** Give a reserved draft back after the upstream call failed. Best effort. */
export async function refundAiDraft(businessId: string, period: string): Promise<void> {
  await createAdminClient().rpc("refund_ai_draft", { p_business_id: businessId, p_period: period });
}
