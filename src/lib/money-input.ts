/**
 * Parsing and formatting for money / percent text inputs.
 * Money is typed as dollars or pounds ("95", "95.50", "$1,234.50") and stored as
 * integer cents. Everything is done on strings, never floats, so 19.99 is exactly 1999.
 */

/** Largest amount accepted (cents): 10 million, comfortably inside an int4. */
export const MAX_MONEY_CENTS = 1_000_000_000;

const DECIMAL = /^\d+(\.\d{1,2})?$|^\.\d{1,2}$/;

function clean(input: string): string {
  // Drop currency symbols, spaces and thousands commas.
  return input.trim().replace(/[\s,$£€]|A\$|AU\$/gi, "");
}

/** "95.5" -> 9550. Returns null for empty, negative, non-numeric or >2-decimal input. */
export function parseMoneyToCents(input: string): number | null {
  const text = clean(input);
  if (!text || !DECIMAL.test(text)) return null;

  const [whole = "0", fraction = ""] = text.split(".");
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || cents > MAX_MONEY_CENTS) return null;
  return cents;
}

/** 9550 -> "95.50". Plain digits so it round-trips through parseMoneyToCents. */
export function formatCentsForInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** "8.5" -> 850 basis points. Returns null if empty, negative, >2 decimals or over `maxPercent`. */
export function parsePercentToBps(input: string, maxPercent = 100): number | null {
  const text = input.trim().replace(/%$/, "").replace(/\s/g, "");
  if (!text || !DECIMAL.test(text)) return null;

  const [whole = "0", fraction = ""] = text.split(".");
  const bps = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0") || "0");
  if (bps > maxPercent * 100) return null;
  return bps;
}

/** 850 -> "8.5", 2000 -> "20", 0 -> "0". */
export function formatBpsAsPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
