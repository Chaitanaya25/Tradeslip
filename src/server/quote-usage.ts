import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Free-plan send counter. usage_counters is not writable by owners, so these use the
 * service role. Call only after the user, business and quote have been verified.
 */

/** Atomically use one send for the period. `ok` is false when the monthly limit is reached. */
export async function reserveQuoteSend(businessId: string, period: string, limit: number): Promise<{ ok: boolean; error?: boolean }> {
  const { data, error } = await createAdminClient().rpc("reserve_quote_send", {
    p_business_id: businessId,
    p_period: period,
    p_limit: limit,
  });
  if (error) return { ok: false, error: true };
  return { ok: data !== null };
}

/** Give a reserved send back (the send did not happen). Best effort. */
export async function refundQuoteSend(businessId: string, period: string): Promise<void> {
  await createAdminClient().rpc("refund_quote_send", { p_business_id: businessId, p_period: period });
}
