/**
 * Plain-language reasons an email did not go out, and the mapping from Resend's
 * errors. Client-safe (no secrets, no server imports) so the Send sheet can reuse the wording.
 */

export type EmailFailure = "not_configured" | "unverified_domain" | "invalid_address" | "rate_limited" | "failed";

export const EMAIL_MESSAGES: Record<EmailFailure, string> = {
  not_configured: "Email isn't set up yet, so nothing was sent. You can still share the link by text message or copy it.",
  unverified_domain:
    "Your sending domain isn't verified yet, so email can only go to your own account address. Verify the domain with your email provider to email customers.",
  invalid_address: "That email address doesn't look right. Check it and try again.",
  rate_limited: "Too many emails were sent just now. Wait a minute and try again.",
  failed: "We couldn't send that email. Try again, or share the link by text message instead.",
};

/** Shown after a successful send. Resend accepting the message is not the same as the inbox showing it. */
export const EMAIL_DELIVERED = "Delivered to the mail server. If the customer can't find it, ask them to check spam.";

export type ResendErrorLike = { name?: string | null; message?: string | null; statusCode?: number | null } | null | undefined;

/** Map a Resend error to a reason. The unverified-domain case is checked first because Resend reports it as a 403 or 422. */
export function mapResendError(error: ResendErrorLike): EmailFailure {
  const name = (error?.name ?? "").toLowerCase();
  const message = (error?.message ?? "").toLowerCase();
  const status = error?.statusCode ?? null;

  if (/testing emails|verify a domain|domain is not verified|not verified|own email address/.test(message)) {
    return "unverified_domain";
  }
  if (name === "missing_api_key" || name === "invalid_api_key" || status === 401) return "not_configured";
  if (name === "rate_limit_exceeded" || name === "daily_quota_exceeded" || status === 429) return "rate_limited";
  if (name === "invalid_to_address" || /invalid .*(to|email|address)|`to`|"to"/.test(message) || (status === 422 && /to/.test(message))) {
    return "invalid_address";
  }
  return "failed";
}
