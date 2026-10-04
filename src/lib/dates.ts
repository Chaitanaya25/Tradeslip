/** Display formatting for dates. Stored dates are UTC; shown in the business timezone. */

/** A date-only value (yyyy-mm-dd), e.g. "28 Oct 2026" (UK/AU) or "Oct 28, 2026" (US). */
export function formatDateOnly(date: string | null | undefined, locale: string): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** A timestamp as a short date in the business timezone: "Oct 14" (US) or "14 Oct" (UK/AU). */
export function formatShortDate(timestamp: string | null | undefined, locale: string, timeZone: string): string {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short" }).format(new Date(timestamp));
}

/** A timestamp with time, e.g. "Oct 14, 9:30 AM" / "14 Oct, 09:30". */
export function formatDateTime(timestamp: string | null | undefined, locale: string, timeZone: string): string {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
