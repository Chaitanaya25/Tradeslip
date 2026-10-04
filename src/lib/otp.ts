import "server-only";
import { createHash, randomInt } from "node:crypto";
import { OTP_LENGTH } from "./otp-format";

/** A random 6-digit code from the OS random source, zero-padded ("004217"). */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/** sha256(code + pepper), hex. Only this is stored; a 6-digit code alone is trivially guessable. */
export function hashOtp(code: string, pepper: string): string {
  return createHash("sha256").update(code + pepper).digest("hex");
}

const DEV_PEPPER = "dev-only-otp-pepper-do-not-use-in-production";

/**
 * The pepper for hashing codes. In production OTP_PEPPER must be set (16+ characters),
 * otherwise this returns null and the OTP actions refuse to run. Outside production a
 * clearly named fallback keeps local development working.
 */
export function resolvePepper(env: { NODE_ENV?: string; OTP_PEPPER?: string | undefined }): string | null {
  const configured = env.OTP_PEPPER?.trim();
  if (configured && configured.length >= 16) return configured;
  return env.NODE_ENV === "production" ? null : DEV_PEPPER;
}

/** "jane.doe@gmail.com" -> "j***@gmail.com". Never reveals more than the first letter and the domain. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
