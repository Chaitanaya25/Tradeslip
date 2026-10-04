"use server";

import { headers } from "next/headers";
import { checkRateLimits, clientIp, ipSubject, tokenSubject } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptInputSchema, declineInputSchema } from "@/lib/schemas/public-quote";
import { notifyOwner } from "@/server/email/notify";
import { getPublicQuote } from "@/server/public";

/**
 * What a customer can do from the public page. Keyed only by the link token, so everything
 * is validated here, rate limited per IP and per token, and applied by atomic SQL functions.
 */

export type PublicResponse =
  | { ok: true; status: "accepted" | "declined"; alreadyDone: boolean; at: string | null; name: string | null; depositUrl: string | null }
  | { ok: false; code: "invalid" | "rate_limited" | "expired" | "not_allowed" | "not_found" | "error"; message: string };

const MESSAGES = {
  rate_limited: "Too many tries. Wait a minute and try again.",
  expired: "This estimate has expired. Contact the business for an updated one.",
  not_allowed: "This estimate can no longer be changed.",
  not_found: "We couldn't find this estimate.",
  error: "Something went wrong. Please try again.",
} as const;

async function requestInfo() {
  const h = await headers();
  return {
    ip: clientIp(h.get("x-forwarded-for"), h.get("x-real-ip")),
    userAgent: (h.get("user-agent") ?? "").slice(0, 300),
  };
}

async function allowed(token: string, ip: string): Promise<boolean> {
  const { allowed } = await checkRateLimits([
    { subject: ipSubject(ip), key: "public-respond", limit: 10 },
    { subject: tokenSubject(token), key: "public-respond", limit: 10 },
  ]);
  return allowed;
}

async function result(token: string, status: "accepted" | "declined", alreadyDone: boolean): Promise<PublicResponse> {
  const quote = await getPublicQuote(token);
  const depositUrl =
    status === "accepted" && quote?.quote.deposit_enabled && quote.business.payment_link_url ? quote.business.payment_link_url : null;
  return {
    ok: true,
    status,
    alreadyDone,
    at: status === "accepted" ? (quote?.quote.accepted_at ?? null) : (quote?.quote.declined_at ?? null),
    name: quote?.quote.accepted_name ?? null,
    depositUrl,
  };
}

export async function acceptQuote(token: string, name: string, confirmed: boolean): Promise<PublicResponse> {
  const parsed = acceptInputSchema.safeParse({ token, name, confirmed });
  if (!parsed.success) {
    const first = parsed.error.issues.find((i) => i.path[0] !== "token");
    return first ? { ok: false, code: "invalid", message: first.message } : { ok: false, code: "not_found", message: MESSAGES.not_found };
  }

  const { ip, userAgent } = await requestInfo();
  if (!(await allowed(parsed.data.token, ip))) return { ok: false, code: "rate_limited", message: MESSAGES.rate_limited };

  const { data, error } = await createAdminClient().rpc("accept_quote", {
    p_token: parsed.data.token,
    p_name: parsed.data.name,
    p_ip: ip,
    p_ua: userAgent,
  });
  if (error) return { ok: false, code: "error", message: MESSAGES.error };

  switch (data) {
    case "ok": {
      await notifyOwner(parsed.data.token, { kind: "accepted", acceptedName: parsed.data.name });
      return result(parsed.data.token, "accepted", false);
    }
    case "already_accepted":
      return result(parsed.data.token, "accepted", true);
    case "expired":
    case "not_allowed":
    case "not_found":
      return { ok: false, code: data, message: MESSAGES[data] };
    case "invalid":
      return { ok: false, code: "invalid", message: "Enter your full name." };
    default:
      return { ok: false, code: "error", message: MESSAGES.error };
  }
}

export async function declineQuote(token: string, reason?: string): Promise<PublicResponse> {
  const parsed = declineInputSchema.safeParse({ token, reason });
  if (!parsed.success) {
    const first = parsed.error.issues.find((i) => i.path[0] !== "token");
    return first ? { ok: false, code: "invalid", message: first.message } : { ok: false, code: "not_found", message: MESSAGES.not_found };
  }

  const { ip } = await requestInfo();
  if (!(await allowed(parsed.data.token, ip))) return { ok: false, code: "rate_limited", message: MESSAGES.rate_limited };

  const { data, error } = await createAdminClient().rpc("decline_quote", {
    p_token: parsed.data.token,
    p_reason: parsed.data.reason ?? "",
  });
  if (error) return { ok: false, code: "error", message: MESSAGES.error };

  switch (data) {
    case "ok": {
      await notifyOwner(parsed.data.token, { kind: "declined", reason: parsed.data.reason?.trim() || null });
      return result(parsed.data.token, "declined", false);
    }
    case "already_declined":
      return result(parsed.data.token, "declined", true);
    case "expired":
    case "not_allowed":
    case "not_found":
      return { ok: false, code: data, message: MESSAGES[data] };
    default:
      return { ok: false, code: "error", message: MESSAGES.error };
  }
}
