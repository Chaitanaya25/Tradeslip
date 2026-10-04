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
