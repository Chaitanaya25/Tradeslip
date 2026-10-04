import { OTP_MAX_ATTEMPTS } from "./otp-format";

/**
 * Pure mirror of the rules in migration 008, so the acceptance state machine is unit
 * tested next to the SQL. The database is the source of truth; this documents it.
 */

export type OtpState = {
  /** Newest unused code, if any. */
  code: { expired: boolean; attempts: number; matches: boolean } | null;
};

export type AcceptContext = {
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  lapsed: boolean; // valid_until has passed
  hasEmail: boolean;
  nameOk: boolean;
};

export type VerifiedResult =
  | { result: "ok" | "already_accepted" | "expired" | "not_allowed" | "invalid" | "not_found" | "expired_code" | "locked" }
  | { result: "wrong_code"; attemptsLeft: number };

/** accept_quote_verified(): what a code attempt does. */
export function decideVerifiedAccept(ctx: AcceptContext, otp: OtpState): VerifiedResult {
  if (ctx.status === "draft") return { result: "not_found" };
  if (ctx.status === "accepted") return { result: "already_accepted" };
  if (ctx.status === "expired") return { result: "expired" };
  if (ctx.status !== "sent" && ctx.status !== "viewed") return { result: "not_allowed" };
  if (ctx.lapsed) return { result: "expired" };
  if (!ctx.nameOk) return { result: "invalid" };

  if (!otp.code || otp.code.expired) return { result: "expired_code" };
  if (otp.code.attempts >= OTP_MAX_ATTEMPTS) return { result: "locked" };
  if (!otp.code.matches) {
    const used = otp.code.attempts + 1;
    return used >= OTP_MAX_ATTEMPTS ? { result: "locked" } : { result: "wrong_code", attemptsLeft: OTP_MAX_ATTEMPTS - used };
  }
  return { result: "ok" };
}

/** accept_quote() (no code): only for customers with no email on file. */
export function decideUnverifiedAccept(ctx: AcceptContext): VerifiedResult["result"] {
  if (ctx.status === "draft") return "not_found";
  if (ctx.status === "accepted") return "already_accepted";
  if (ctx.status === "expired") return "expired";
  if (ctx.status !== "sent" && ctx.status !== "viewed") return "not_allowed";
  if (ctx.lapsed) return "expired";
  if (ctx.hasEmail) return "not_allowed"; // the code step cannot be skipped
  return ctx.nameOk ? "ok" : "invalid";
}

/** issue_accept_otp(): whether a new code may be issued right now. */
export function decideIssue(input: {
  status: AcceptContext["status"];
  lapsed: boolean;
  hasEmail: boolean;
  secondsSinceLastCode: number | null;
  codesInLastHour: number;
}): "ok" | "cooldown" | "too_many" | "not_allowed" | "not_found" {
  if (input.status === "draft") return "not_found";
  if (input.status !== "sent" && input.status !== "viewed") return "not_allowed";
  if (input.lapsed || !input.hasEmail) return "not_allowed";
  if (input.secondsSinceLastCode !== null && input.secondsSinceLastCode < 60) return "cooldown";
  if (input.codesInLastHour >= 3) return "too_many";
  return "ok";
}
