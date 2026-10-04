import { FREE_QUOTES_PER_MONTH, effectivePlanOf, trialDaysLeft, type PlanInput } from "./plans";

/**
 * The slim, calm banner at the top of the app: a trial with 3 days or fewer left, or the free plan with 2 of 3
 * quotes used. No countdown theatre, no dark patterns: one sentence and a link. `id` lets a dismissal last for the session.
 */
export type PlanBannerContent = { id: string; text: string; href: string; cta: string };

export function planBannerFor(
  business: PlanInput & { timezone: string },
  opts: { quotesSent: number; quoteWord: string; now?: Date },
): PlanBannerContent | null {
  const now = opts.now ?? new Date();
  const plan = effectivePlanOf(business, now);

  if (plan === "trial") {
    const days = trialDaysLeft(business, business.timezone, now);
    if (days === null || days > 3) return null;
    return {
      id: `trial-${days}`,
      text: days === 0 ? "Your free trial ends today." : days === 1 ? "Your free trial ends in 1 day." : `Your free trial ends in ${days} days.`,
      href: "/settings/billing",
      cta: "See plans",
    };
  }

  if (plan === "free" && opts.quotesSent >= FREE_QUOTES_PER_MONTH - 1) {
    const word = opts.quoteWord.toLowerCase();
    return {
      id: `free-${opts.quotesSent}`,
      text:
        opts.quotesSent >= FREE_QUOTES_PER_MONTH
          ? `You've sent all ${FREE_QUOTES_PER_MONTH} ${word}s the free plan includes this month.`
          : `You've sent ${opts.quotesSent} of ${FREE_QUOTES_PER_MONTH} ${word}s the free plan includes this month.`,
      href: "/settings/billing",
      cta: "See plans",
    };
  }
  return null;
}

export type PlanBannerData = PlanBannerContent;
