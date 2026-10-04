"use server";

import { headers } from "next/headers";
import { checkRateLimits, clientIp, ipSubject, tokenSubject } from "@/lib/rate-limit";
import { resolveUnsubscribeSecret, verifyUnsubscribeToken } from "@/lib/reminder-token";
import { createAdminClient } from "@/lib/supabase/admin";

export type UnsubscribeResult = { ok: true } | { ok: false; message: string };

const NEUTRAL = "This link isn't working. If you keep getting reminders, reply to the email and ask the business to stop them.";

/**
 * Stop reminders from one business to the address in a signed link. Public (the link is the credential),
 * rate limited by IP and token, idempotent, and it never says whether the address was known.
 */
export async function confirmUnsubscribe(token: string): Promise<UnsubscribeResult> {
  const secret = resolveUnsubscribeSecret();
  const claim = secret ? verifyUnsubscribeToken(token, secret) : null;
  if (!claim) return { ok: false, message: NEUTRAL };

  const h = await headers();
  const ip = clientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  const { allowed } = await checkRateLimits([
    { subject: ipSubject(ip), key: "unsubscribe", limit: 10 },
    { subject: tokenSubject(token), key: "unsubscribe", limit: 5 },
  ]);
  if (!allowed) return { ok: false, message: "Too many attempts. Try again in a minute." };

  const { error } = await createAdminClient().rpc("record_unsubscribe", { p_business_id: claim.businessId, p_email: claim.email });
  if (error) return { ok: false, message: "We couldn't save that just now. Try again in a moment." };
  return { ok: true };
}
