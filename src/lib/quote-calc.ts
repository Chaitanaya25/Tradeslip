import { addCents, multiplyQtyByRateCents, sumCents, taxFromBps } from "./money";

/**
 * Quote maths. Everything here is integer cents; the builder uses it for the
 * live preview and the server action uses it as the source of truth.
 */

export type CalcItem = { qty: number; unitRateCents: number };

export type QuoteTotals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** Per-line amounts, same order as the input items. */
  lineAmountsCents: number[];
};

/** qty x rate, rounded to the nearest cent (half away from zero). */
export function calculateLine(qty: number, unitRateCents: number): number {
  return multiplyQtyByRateCents(qty, unitRateCents);
}

/** Tax is rounded once on the subtotal (not per line), so $310.00 at 8% is exactly $24.80. */
export function calculateQuoteTotals(
  items: readonly CalcItem[],
  taxEnabled: boolean,
  taxRateBps: number,
): QuoteTotals {
  const lineAmountsCents = items.map((i) => calculateLine(i.qty, i.unitRateCents));
  const subtotalCents = sumCents(lineAmountsCents);
  const taxCents = taxEnabled ? taxFromBps(subtotalCents, taxRateBps) : 0;
  return { subtotalCents, taxCents, totalCents: addCents(subtotalCents, taxCents), lineAmountsCents };
}

/** Deposit requested on the total, e.g. 30% (3000 bps) of $334.80 = $100.44. */
export function depositCents(totalCents: number, depositBps: number): number {
  return taxFromBps(totalCents, depositBps);
}

/** A price-book rate with its markup applied (materials): 1200 + 20% = 1440. */
export function applyMarkup(rateCents: number, markupBps: number): number {
  return addCents(rateCents, taxFromBps(rateCents, markupBps));
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as yyyy-mm-dd. */
export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** today (yyyy-mm-dd) + validity days -> yyyy-mm-dd, using UTC calendar maths (no DST drift). */
export function defaultValidUntil(today: string, validityDays: number): string {
  if (!isValidDateString(today)) throw new Error(`Not a yyyy-mm-dd date: ${today}`);
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + validityDays));
  return date.toISOString().slice(0, 10);
}

/** Today's date (yyyy-mm-dd) in a business's timezone. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "1047" with no prefix, "QU-1047" with one. */
export function formatDocNumber(prefix: string, number: number): string {
  return `${prefix}${number}`;
}
