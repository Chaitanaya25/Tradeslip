/** Client-safe OTP constants and input handling (no crypto, no server imports). */

export const OTP_LENGTH = 6;
export const OTP_COOLDOWN_SECONDS = 60;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

/** Strip spaces and dashes people type or paste ("123 456", "123-456"). */
export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export function isValidCode(input: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(input);
}
