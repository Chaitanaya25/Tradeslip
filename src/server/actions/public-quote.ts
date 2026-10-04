"use server";

import { headers } from "next/headers";
import { OTP_COOLDOWN_SECONDS, OTP_EXPIRY_MINUTES } from "@/lib/otp-format";
import { generateOtpCode, hashOtp, maskEmail, resolvePepper } from "@/lib/otp";
import { checkRateLimits, clientIp, ipSubject, tokenSubject } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { logoPublicUrl } from "@/lib/supabase/storage";
import {
  acceptInputSchema,
  declineInputSchema,
  requestCodeInputSchema,
  verifyCodeInputSchema,
} from "@/lib/schemas/public-quote";
import { quoteWord } from "@/lib/region";
import { notifyOwner } from "@/server/email/notify";
import { sendEmail } from "@/server/email/send";
import { OtpCodeEmail } from "@/server/email/templates/otp-code";
import { getAcceptTarget, getPublicQuote, requestIsOwner } from "@/server/public";

/**
 * What a customer can do from the public page. Keyed only by the link token, so everything
 * is validated here, rate limited per IP and per token, and applied by atomic SQL functions.
 *
 * Privacy: the customer's email address is read server-side and never sent to the browser
 * (only a masked form like j***@gmail.com). Codes and their hashes are never logged or returned.
 */

type FailureCode =
  | "invalid"
  | "rate_limited"
  | "expired"
  | "not_allowed"
  | "not_found"
  | "error"
  | "wrong_code"
  | "locked"
  | "expired_code"
  | "cooldown"
  | "too_many"
  | "email_failed"
  | "unavailable";

export type PublicResponse =
  | { ok: true; status: "accepted" | "declined"; alreadyDone: boolean; at: string | null; name: string | null; depositUrl: string | null }
  | { ok: false; code: FailureCode; message: string; attemptsLeft?: number | null };

export type CodeRequestResponse =
  | { ok: true; maskedEmail: string; cooldownSeconds: number }
  | { ok: false; code: FailureCode; message: string; retryAfterSeconds?: number };

const MESSAGES = {
  rate_limited: "Too many tries. Wait a minute and try again.",
  expired: "This estimate has expired. Contact the business for an updated one.",
  not_allowed: "This estimate can no longer be changed.",
  not_found: "We couldn't find this estimate.",
  error: "Something went wrong. Please try again.",
  unavailable: "Verification isn't available right now. Please contact the business.",
  owner: "You are signed in as the owner of this estimate. Customers accept it from their own link.",
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

function firstIssue(issues: { path: PropertyKey[]; message: string }[]): PublicResponse {
  const first = issues.find((i) => i.path[0] !== "token");
  return first ? { ok: false, code: "invalid", message: first.message } : { ok: false, code: "not_found", message: MESSAGES.not_found };
}

/**
 * Step 1 of accepting: email a 6-digit code to the address ON FILE. The browser sends only
 * the token, the name and the checkbox; it never sees or supplies the email address.
 */
export async function requestAcceptCode(token: string, name: string, confirmed: boolean): Promise<CodeRequestResponse> {
  const parsed = requestCodeInputSchema.safeParse({ token, name, confirmed });
  if (!parsed.success) return firstIssue(parsed.error.issues) as CodeRequestResponse;

  const pepper = resolvePepper(process.env);
  if (!pepper) {
    console.error("[otp] OTP_PEPPER is not set; refusing to issue codes");
    return { ok: false, code: "unavailable", message: MESSAGES.unavailable };
  }

  const { ip } = await requestInfo();
  if (!(await allowed(parsed.data.token, ip))) return { ok: false, code: "rate_limited", message: MESSAGES.rate_limited };

  if (await requestIsOwner(parsed.data.token)) return { ok: false, code: "not_allowed", message: MESSAGES.owner };

  const target = await getAcceptTarget(parsed.data.token);
  if (!target) return { ok: false, code: "not_found", message: MESSAGES.not_found };
  if (!target.email) return { ok: false, code: "not_allowed", message: "This estimate can be accepted without a code." };

  const code = generateOtpCode();
  const { data, error } = await createAdminClient().rpc("issue_accept_otp", {
    p_token: parsed.data.token,
    p_code_hash: hashOtp(code, pepper),
  });
  if (error) return { ok: false, code: "error", message: MESSAGES.error };

  switch (data) {
    case "ok":
      break;
    case "cooldown":
      return { ok: false, code: "cooldown", message: `A code was just sent. You can ask for another in ${OTP_COOLDOWN_SECONDS} seconds.`, retryAfterSeconds: OTP_COOLDOWN_SECONDS };
    case "too_many":
      return { ok: false, code: "too_many", message: "Too many codes requested for this estimate. Try again in an hour, or contact the business." };
    case "not_allowed":
      return { ok: false, code: "not_allowed", message: MESSAGES.not_allowed };
    case "not_found":
      return { ok: false, code: "not_found", message: MESSAGES.not_found };
    default:
      return { ok: false, code: "error", message: MESSAGES.error };
  }

  const word = quoteWord(target.country);
  const sent = await sendEmail({
    businessName: target.business_name,
    to: target.email,
    replyTo: target.business_email,
    subject: `Your code to accept ${word.toLowerCase()} #${target.number_prefix}${target.number}`,
    react: OtpCodeEmail({
      businessName: target.business_name,
      logoUrl: logoPublicUrl(target.logo_path),
      customerName: target.customer_name,
      quoteWord: word,
      number: `${target.number_prefix}${target.number}`,
      code,
      expiresMinutes: OTP_EXPIRY_MINUTES,
    }),
  });
  if (!sent.ok) {
    // The reason is logged by sendEmail (code only). The customer gets a plain next step.
    return { ok: false, code: "email_failed", message: `We couldn't email the code. Please contact ${target.business_name} to accept another way.` };
  }

  return { ok: true, maskedEmail: maskEmail(target.email), cooldownSeconds: OTP_COOLDOWN_SECONDS };
}

/** Step 2: check the code and accept. All checking happens in one atomic database call. */
export async function verifyAcceptCode(token: string, name: string, code: string): Promise<PublicResponse> {
  const parsed = verifyCodeInputSchema.safeParse({ token, name, code });
  if (!parsed.success) return firstIssue(parsed.error.issues);

  const pepper = resolvePepper(process.env);
  if (!pepper) return { ok: false, code: "unavailable", message: MESSAGES.unavailable };

  const { ip, userAgent } = await requestInfo();
  if (!(await allowed(parsed.data.token, ip))) return { ok: false, code: "rate_limited", message: MESSAGES.rate_limited };

  if (await requestIsOwner(parsed.data.token)) return { ok: false, code: "not_allowed", message: MESSAGES.owner };

  const { data, error } = await createAdminClient().rpc("accept_quote_verified", {
    p_token: parsed.data.token,
    p_name: parsed.data.name,
    p_code_hash: hashOtp(parsed.data.code, pepper),
    p_ip: ip,
    p_ua: userAgent,
  });
  const row = data?.[0];
  if (error || !row) return { ok: false, code: "error", message: MESSAGES.error };

  switch (row.result) {
    case "ok":
      await notifyOwner(parsed.data.token, { kind: "accepted", acceptedName: parsed.data.name, verified: true });
      return result(parsed.data.token, "accepted", false);
    case "already_accepted":
      return result(parsed.data.token, "accepted", true);
    case "wrong_code": {
      const left = row.attempts_left ?? 0;
      return {
        ok: false,
        code: "wrong_code",
        attemptsLeft: left,
        message: `That code isn't right. ${left} ${left === 1 ? "attempt" : "attempts"} left.`,
      };
    }
    case "locked":
      return { ok: false, code: "locked", attemptsLeft: 0, message: "Too many wrong codes. Ask for a new code to try again." };
    case "expired_code":
      return { ok: false, code: "expired_code", message: "That code has expired or was already used. Ask for a new code." };
    case "expired":
    case "not_allowed":
    case "not_found":
      return { ok: false, code: row.result, message: MESSAGES[row.result] };
    case "invalid":
      return { ok: false, code: "invalid", message: "Enter your full name." };
    default:
      return { ok: false, code: "error", message: MESSAGES.error };
  }
}

/**
 * Single-step accept, ONLY for customers with no email on file. The database refuses it
 * whenever an email exists, so the code step cannot be skipped by calling this directly.
 */
export async function acceptQuote(token: string, name: string, confirmed: boolean): Promise<PublicResponse> {
  const parsed = acceptInputSchema.safeParse({ token, name, confirmed });
  if (!parsed.success) return firstIssue(parsed.error.issues);

  const { ip, userAgent } = await requestInfo();
  if (!(await allowed(parsed.data.token, ip))) return { ok: false, code: "rate_limited", message: MESSAGES.rate_limited };

  if (await requestIsOwner(parsed.data.token)) return { ok: false, code: "not_allowed", message: MESSAGES.owner };

  const { data, error } = await createAdminClient().rpc("accept_quote", {
    p_token: parsed.data.token,
    p_name: parsed.data.name,
    p_ip: ip,
    p_ua: userAgent,
  });
  if (error) return { ok: false, code: "error", message: MESSAGES.error };

  switch (data) {
    case "ok": {
      await notifyOwner(parsed.data.token, { kind: "accepted", acceptedName: parsed.data.name, verified: false });
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
  if (!parsed.success) return firstIssue(parsed.error.issues);

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
