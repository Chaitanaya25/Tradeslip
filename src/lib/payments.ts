import { isValidDateString } from "./quote-calc";

export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "cheque", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  other: "Other",
};

/** yyyy-mm-dd + days (UTC calendar maths). */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type PaymentCheck = { ok: true } | { ok: false; field: "amount" | "method" | "date"; message: string };

/**
 * Whether a payment may be recorded. `today` is the business-local date. A payment can be
 * dated up to one day ahead (timezone slack) but not further.
 */
export function validatePaymentInput(
  amountCents: number,
  remainingCents: number,
  method: string,
  date: string,
  today: string,
): PaymentCheck {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, field: "amount", message: "Enter an amount above zero." };
  }
  if (amountCents > remainingCents) {
    return { ok: false, field: "amount", message: "That is more than the balance still owed." };
  }
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
    return { ok: false, field: "method", message: "Choose how it was paid." };
  }
  if (!isValidDateString(date)) return { ok: false, field: "date", message: "Enter a valid date." };
  if (date > addDays(today, 1)) return { ok: false, field: "date", message: "The payment date can't be in the future." };
  return { ok: true };
}
