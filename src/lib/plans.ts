import { todayInTimezone } from "./quote-calc";

export type Plan = "trial" | "free" | "pro" | "business";

/** AI voice drafts allowed per calendar month (ARCHITECTURE.md §6 cost guard). */
export const AI_DRAFT_LIMITS: Record<Plan, number> = {
  trial: 10,
  free: 10,
  pro: 300,
  business: 300,
};

export function aiDraftLimit(plan: string): number {
  return AI_DRAFT_LIMITS[plan as Plan] ?? AI_DRAFT_LIMITS.free;
}

/** The usage_counters period for "now" in the business's timezone, e.g. "2026-10". */
export function usagePeriod(timeZone: string, now: Date = new Date()): string {
  return todayInTimezone(timeZone, now).slice(0, 7);
}

export function limitReachedMessage(plan: string): string {
  const limit = aiDraftLimit(plan);
  return `You've used all ${limit} voice drafts for this month. You can still build quotes by hand, or upgrade for more.`;
}

/** Max AI draft requests per user per minute. */
export const AI_DRAFTS_PER_MINUTE = 5;

/** Start of the current one-minute rate-limit window (ISO string). */
export function rateLimitWindowStart(now: Date = new Date()): string {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
}

/** Quotes a free-plan business may send per calendar month. Trial and paid plans are unlimited. */
export const FREE_QUOTES_PER_MONTH = 3;

/** Monthly send limit for a plan, or null when unlimited. */
export function quoteSendLimit(plan: string): number | null {
  return plan === "free" ? FREE_QUOTES_PER_MONTH : null;
}

/** Sends left this month (null = unlimited). */
export function quoteSendsRemaining(plan: string, used: number): number | null {
  const limit = quoteSendLimit(plan);
  return limit === null ? null : Math.max(0, limit - used);
}

export function quoteLimitMessage(quoteWord: string): string {
  return `You've sent ${FREE_QUOTES_PER_MONTH} ${quoteWord.toLowerCase()}s this month, which is the limit on the free plan. Upgrade to send more, or wait until next month.`;
}
