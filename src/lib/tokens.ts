import { randomBytes } from "node:crypto";

/** A public link token: 24 random bytes as base64url (32 URL-safe characters, 192 bits). */
export function generatePublicToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Shape check only (never proof a token exists). Used to reject junk before any
 * database call. Accepts app tokens (base64url) and the 64-char hex DB default.
 */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}
