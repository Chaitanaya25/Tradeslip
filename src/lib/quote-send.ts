/**
 * Rules for sending a quote and for the customer's responses. Pure, so the same
 * checks run in the builder (checklist) and on the server (the source of truth).
 */

export type SendableStatus = "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";

export type SendCheckItem = { description: string; unit_rate_cents: number; needs_price?: boolean };
export type SendCheckCustomer = { name: string | null; email: string | null; phone: string | null } | null;

/** Plain-language list of what still blocks sending. Empty means ready. */
export function getSendProblems(
  items: readonly SendCheckItem[],
  customer: SendCheckCustomer,
  /** Pass for a first send: a quote whose valid-until date has already passed cannot go out. */
  dates?: { validUntil: string | null; today: string },
): string[] {
  const problems: string[] = [];

  if (!customer?.name?.trim()) problems.push("Add the customer's name.");
  if (!customer?.email?.trim() && !customer?.phone?.trim()) {
    problems.push("Add a customer email or phone number so they can be sent the link.");
  }

  if (items.length === 0) {
    problems.push("Add at least one item.");
  } else {
    const noDescription = items.filter((i) => !i.description.trim()).length;
    if (noDescription > 0) {
      problems.push(noDescription === 1 ? "1 item needs a description." : `${noDescription} items need a description.`);
    }
    const unpriced = items.filter((i) => i.description.trim() && (i.needs_price || i.unit_rate_cents <= 0)).length;
    if (unpriced > 0) problems.push(unpriced === 1 ? "1 item needs a price." : `${unpriced} items need a price.`);
  }

  if (dates && isExpired(dates.validUntil, dates.today)) {
    problems.push("The valid-until date has already passed. Choose a later date.");
  }

  return problems;
}

/** Only drafts (first send) and already-sent quotes (resend) can be sent. */
export function canSend(status: SendableStatus): boolean {
  return status === "draft" || status === "sent" || status === "viewed";
}

/** A quote is valid through the whole of `validUntil` (dates are yyyy-mm-dd in the business timezone). */
export function isExpired(validUntil: string | null | undefined, today: string): boolean {
  return Boolean(validUntil) && (validUntil as string) < today;
}

/** The customer may respond only while the quote is open (sent or viewed) and not expired. */
export function canAccept(status: SendableStatus, validUntil: string | null | undefined, today: string): boolean {
  return (status === "sent" || status === "viewed") && !isExpired(validUntil, today);
}

export const canDecline = canAccept;

/** Status to show a customer: open quotes past their date read as expired. */
export function effectiveStatus(status: SendableStatus, validUntil: string | null | undefined, today: string): SendableStatus {
  return (status === "sent" || status === "viewed") && isExpired(validUntil, today) ? "expired" : status;
}

export type ResponseResult = "ok" | "already_accepted" | "already_declined" | "expired" | "not_allowed" | "invalid" | "not_found";

/**
 * Mirror of accept_quote() in SQL (migration 007) so the state machine is unit tested.
 * Idempotent: a repeat of the same response is reported, never re-applied.
 */
export function decideAccept(status: SendableStatus, validUntil: string | null, today: string): ResponseResult {
  if (status === "accepted") return "already_accepted";
  if (status === "expired") return "expired";
  if (status === "sent" || status === "viewed") return isExpired(validUntil, today) ? "expired" : "ok";
  return "not_allowed";
}

export function decideDecline(status: SendableStatus, validUntil: string | null, today: string): ResponseResult {
  if (status === "declined") return "already_declined";
  if (status === "expired") return "expired";
  if (status === "sent" || status === "viewed") return isExpired(validUntil, today) ? "expired" : "ok";
  return "not_allowed";
}

/** First view only counts while the quote is still `sent`. */
export function shouldRecordView(status: SendableStatus, viewedAt: string | null): boolean {
  return status === "sent" && viewedAt === null;
}
