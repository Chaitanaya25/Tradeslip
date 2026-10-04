/**
 * Money is ALWAYS integer cents. Never use floats for amounts; format only at
 * display time with formatMoney().
 */

export type Currency = "USD" | "GBP" | "AUD";

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer number of cents, got ${value}`);
  }
}

/** Integer division rounded half away from zero (so -0.5 -> -1, 0.5 -> 1). */
function divideRound(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  const quotient = Math.floor(abs / denominator);
  const remainder = abs - quotient * denominator;
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient;
  return rounded === 0 ? 0 : sign * rounded;
}

export function addCents(a: number, b: number): number {
  assertCents(a, "a");
  assertCents(b, "b");
  return a + b;
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => addCents(total, value), 0);
}

/**
 * qty x unit rate, rounded to the nearest cent (half away from zero).
 * qty has at most 2 decimals (numeric(10,2) in the DB); it is converted to
 * hundredths first so e.g. 0.1 x 3 never picks up float error.
 */
export function multiplyQtyByRateCents(qty: number, rateCents: number): number {
  assertCents(rateCents, "rateCents");
  if (!Number.isFinite(qty)) {
    throw new Error(`qty must be a finite number, got ${qty}`);
  }
  const qtyHundredths = Math.round(qty * 100);
  return divideRound(qtyHundredths * rateCents, 100);
}

/** Tax on an amount. bps = basis points (2000 = 20%). Rounded half away from zero. */
export function taxFromBps(amountCents: number, bps: number): number {
  assertCents(amountCents, "amountCents");
  assertCents(bps, "bps");
  return divideRound(amountCents * bps, 10_000);
}

/** Format integer cents for display, e.g. formatMoney(33480, "USD") -> "$334.80". */
export function formatMoney(cents: number, currency: Currency | string, locale = "en-US"): string {
  assertCents(cents, "cents");
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
