import { todayInTimezone } from "./quote-calc";

/**
 * Plans, limits and prices: ONE table, and ONE function that says which plan is actually in force.
 *
 * Never read `business.plan` directly. The stored string says what Paddle last told us; whether it still
 * applies depends on the trial end, the subscription status and the period end. Call `effectivePlan` /
 * `effectivePlanOf` and pass its result to everything else here. The SQL twin is `effective_plan()`
 * (migration 012); both are tested against src/lib/plans.fixtures.json.
 */

export type PlanKey = "free" | "trial" | "pro" | "business";
export type PlanCurrency = "USD" | "GBP" | "AUD";
export type BillingInterval = "month" | "year";
export type LimitKind = "quote_send" | "ai_draft" | "reminders";
export type Feature = "reminders" | "brandingFooter" | "depositsTracking" | "recurringInvoices" | "profitPerJob" | "reviewRequests";

/** Prices in integer cents. `year` is null where there is no yearly option. */
export type PlanPrices = Record<PlanCurrency, { month: number; year: number | null }>;

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  tagline: string;
  limits: {
    /** Sent quotes per calendar month; null = unlimited. */
    sentQuotesPerMonth: number | null;
    aiDraftsPerMonth: number;
  };
  features: Record<Feature, boolean>;
  /** null for plans you cannot buy (free, trial). */
  prices: PlanPrices | null;
  highlights: string[];
};

const none: Record<Feature, boolean> = { reminders: false, brandingFooter: false, depositsTracking: false, recurringInvoices: false, profitPerJob: false, reviewRequests: false };

export const PLANS: Record<PlanKey, PlanDefinition> = {
  free: {
    key: "free",
    name: "Free",
    tagline: "For trying it out",
    limits: { sentQuotesPerMonth: 3, aiDraftsPerMonth: 10 },
    features: { ...none, brandingFooter: true },
    prices: null,
    highlights: ["3 sent quotes a month", "Voice drafting (10 a month)", "Customer link, PDF and acceptance by link", "\"Sent with Tradeslip\" footer"],
  },
  trial: {
    key: "trial",
    name: "Free trial",
    tagline: "14 days of Pro, no card",
    limits: { sentQuotesPerMonth: null, aiDraftsPerMonth: 10 },
    features: { ...none, reminders: true, brandingFooter: true },
    prices: null,
    highlights: ["Unlimited quotes", "Automatic reminders", "Voice drafting"],
  },
  pro: {
    key: "pro",
    name: "Pro",
    tagline: "For a working tradesperson",
    limits: { sentQuotesPerMonth: null, aiDraftsPerMonth: 300 },
    features: { ...none, reminders: true },
    prices: {
      USD: { month: 1900, year: 16900 },
      GBP: { month: 1500, year: 13500 },
      AUD: { month: 2900, year: 25900 },
    },
    highlights: ["Unlimited quotes and invoices", "Voice drafting (300 a month)", "Automatic reminders", "No Tradeslip footer"],
  },
  business: {
    key: "business",
    name: "Business",
    tagline: "For a growing team",
    limits: { sentQuotesPerMonth: null, aiDraftsPerMonth: 300 },
    features: { ...none, reminders: true, depositsTracking: true, recurringInvoices: true, profitPerJob: true, reviewRequests: true },
    prices: {
      USD: { month: 3900, year: null },
      GBP: { month: 3100, year: null },
      AUD: { month: 5900, year: null },
    },
    highlights: ["Everything in Pro", "Deposit tracking", "Recurring invoices", "Profit per job and review requests (coming soon)"],
  },
};

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];
/** Plans a customer can buy. */
export const PAID_PLAN_KEYS = ["pro", "business"] as const;
export type PaidPlanKey = (typeof PAID_PLAN_KEYS)[number];

/** Anything that is not a known plan is treated as free. */
export function planOrFree(plan: string): PlanKey {
  return (PLAN_KEYS as readonly string[]).includes(plan) ? (plan as PlanKey) : "free";
}

// --- Which plan is in force ------------------------------------------------------

export const GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The columns that decide the plan in force. A Business row satisfies this. */
export type PlanInput = {
  plan: string;
  trial_ends_at: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
};

const at = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * The plan actually in force right now.
 * - A paid plan (pro / business) applies while the subscription is active or trialing; while past_due until
 *   `current_period_end` + 7 days (grace); while canceled until `current_period_end`. Paused, none or anything
 *   else does not count, and a stored "pro" with no valid subscription never does.
 * - Otherwise a plan that is still on trial (stored trial, or a lapsed paid plan) with `trial_ends_at` in the
 *   future is "trial". Instants are compared, so this does not depend on any timezone.
 * - Everything else is "free" (including a stored "free").
 */
export function effectivePlan(input: PlanInput, now: Date = new Date()): PlanKey {
  const t = now.getTime();
  const stored = planOrFree(input.plan);
  const status = input.subscription_status ?? "none";
  const periodEnd = at(input.current_period_end);

  if (stored === "pro" || stored === "business") {
    if (status === "active" || status === "trialing") return stored;
    if (status === "past_due" && periodEnd !== null && t < periodEnd + GRACE_DAYS * DAY_MS) return stored;
    if (status === "canceled" && periodEnd !== null && t < periodEnd) return stored;
  }

  if (stored !== "free") {
    const trialEnd = at(input.trial_ends_at);
    if (trialEnd !== null && t < trialEnd) return "trial";
  }
  return "free";
}

/** Same as `effectivePlan`, for a business row. The one place the rest of the app should get a plan from. */
export function effectivePlanOf(business: PlanInput, now: Date = new Date()): PlanKey {
  return effectivePlan(business, now);
}

/** Whole local calendar days left on a trial (0 = it ends today). Null when the plan in force is not a trial. */
export function trialDaysLeft(input: PlanInput, timeZone: string, now: Date = new Date()): number | null {
  if (effectivePlan(input, now) !== "trial" || !input.trial_ends_at) return null;
  const endsLocal = todayInTimezone(timeZone, new Date(input.trial_ends_at));
  const todayLocal = todayInTimezone(timeZone, now);
  const [ey, em, ed] = endsLocal.split("-").map(Number);
  const [ty, tm, td] = todayLocal.split("-").map(Number);
  return Math.max(Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(ty, tm - 1, td)) / DAY_MS), 0);
}

export function isTrialEnding(input: PlanInput, timeZone: string, now: Date = new Date(), withinDays = 3): boolean {
  const left = trialDaysLeft(input, timeZone, now);
  return left !== null && left <= withinDays;
}

// --- Features, limits, usage ---------------------------------------------------------

export function canUseFeature(plan: PlanKey, feature: Feature): boolean {
  return PLANS[planOrFree(plan)].features[feature];
}

/** Monthly send limit for a plan, or null when unlimited. */
export function quoteSendLimit(plan: string): number | null {
  return PLANS[planOrFree(plan)].limits.sentQuotesPerMonth;
}

/** AI voice drafts allowed per calendar month (ARCHITECTURE.md §6 cost guard). */
export const AI_DRAFT_LIMITS: Record<PlanKey, number> = {
  free: PLANS.free.limits.aiDraftsPerMonth,
  trial: PLANS.trial.limits.aiDraftsPerMonth,
  pro: PLANS.pro.limits.aiDraftsPerMonth,
  business: PLANS.business.limits.aiDraftsPerMonth,
};

export function aiDraftLimit(plan: string): number {
  return PLANS[planOrFree(plan)].limits.aiDraftsPerMonth;
}

/** Quotes a free-plan business may send per calendar month. Trial and paid plans are unlimited. */
export const FREE_QUOTES_PER_MONTH = PLANS.free.limits.sentQuotesPerMonth as number;

/** Sends left this month (null = unlimited). */
export function quoteSendsRemaining(plan: string, used: number): number | null {
  const limit = quoteSendLimit(plan);
  return limit === null ? null : Math.max(0, limit - used);
}

/** Limit for one kind of usage on a plan; null = unlimited. */
export function limitFor(plan: string, kind: "quote_send" | "ai_draft"): number | null {
  return kind === "quote_send" ? quoteSendLimit(plan) : aiDraftLimit(plan);
}

export function usageRemaining(plan: string, usage: { quotesSent: number; aiDrafts: number }): { quotes: number | null; aiDrafts: number } {
  return { quotes: quoteSendsRemaining(plan, usage.quotesSent), aiDrafts: Math.max(0, aiDraftLimit(plan) - usage.aiDrafts) };
}

export type UsageProgress = { used: number; limit: number | null; percent: number; state: "unlimited" | "ok" | "near" | "full" };

/** For the progress bars: percent used, and "near" from 80%. */
export function usageProgress(used: number, limit: number | null): UsageProgress {
  const safeUsed = Math.max(0, Math.floor(used));
  if (limit === null) return { used: safeUsed, limit, percent: 0, state: "unlimited" };
  const percent = limit <= 0 ? 100 : Math.min(100, Math.round((safeUsed / limit) * 100));
  return { used: safeUsed, limit, percent, state: safeUsed >= limit ? "full" : percent >= 80 ? "near" : "ok" };
}

/** Whether the "Sent with Tradeslip" footer shows (free and trial). */
export function showsBrandingFooter(plan: PlanKey): boolean {
  return canUseFeature(plan, "brandingFooter");
}

export function planAllowsReminders(plan: string): boolean {
  return canUseFeature(planOrFree(plan), "reminders");
}

// --- Prices ----------------------------------------------------------------------

/** Price in integer cents, or null when the plan or interval is not sold in that currency. */
export function planPrice(plan: PlanKey, currency: PlanCurrency, interval: BillingInterval): number | null {
  const prices = PLANS[plan].prices;
  return prices ? prices[currency][interval] : null;
}

/** How much cheaper yearly is than twelve months, as a whole percent (null when there is no yearly price). */
export function yearlySavingPercent(plan: PlanKey, currency: PlanCurrency): number | null {
  const prices = PLANS[plan].prices?.[currency];
  if (!prices || prices.year === null) return null;
  return Math.round((1 - prices.year / (prices.month * 12)) * 100);
}

// --- Messages ---------------------------------------------------------------------

/** The period for usage_counters ("2026-10") in the business timezone. */
export function usagePeriod(timeZone: string, now: Date = new Date()): string {
  return todayInTimezone(timeZone, now).slice(0, 7);
}

export function limitReachedMessage(plan: string): string {
  const limit = aiDraftLimit(plan);
  return `You've used all ${limit} voice drafts for this month. You can still build quotes by hand, or upgrade for more.`;
}

export function quoteLimitMessage(quoteWord: string): string {
  return `You've sent ${FREE_QUOTES_PER_MONTH} ${quoteWord.toLowerCase()}s this month, which is the limit on the free plan. Upgrade to send more, or wait until next month.`;
}

export type UpgradeMessage = { title: string; body: string; benefit: string };

/** Wording for the upgrade dialog shown when a limit is hit. The server enforces the limit either way. */
export function upgradeMessageFor(kind: LimitKind, opts: { plan?: string; quoteWord?: string } = {}): UpgradeMessage {
  const plan = opts.plan ?? "free";
  switch (kind) {
    case "quote_send":
      return {
        title: "You've reached this month's limit",
        body: quoteLimitMessage(opts.quoteWord ?? "Quote"),
        benefit: "Pro has unlimited quotes and invoices, automatic reminders and no Tradeslip footer.",
      };
    case "ai_draft":
      return {
        title: "You've used this month's voice drafts",
        body: limitReachedMessage(plan),
        benefit: `Pro includes ${PLANS.pro.limits.aiDraftsPerMonth} voice drafts a month.`,
      };
    case "reminders":
      return {
        title: "Reminders are part of the paid plans",
        body: "Automatic follow-ups and payment reminders aren't available on the free plan.",
        benefit: "Pro sends a polite follow-up on unanswered quotes and up to two reminders on overdue invoices, for you.",
      };
  }
}

// --- Rate limits (unchanged) -----------------------------------------------------------

/** Max AI draft requests per user per minute. */
export const AI_DRAFTS_PER_MINUTE = 5;

/** Start of the current one-minute rate-limit window (ISO string). */
export function rateLimitWindowStart(now: Date = new Date()): string {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
}
