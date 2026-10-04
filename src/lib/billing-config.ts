import type { BillingInterval, PaidPlanKey } from "./plans";

/**
 * Paddle configuration from the environment. Price ids are an allow-list: a price id that is not one of these
 * is never charged and never maps to a plan, whatever a browser or an event says. Server-readable only
 * (the client token is the one public value, passed to the billing page explicitly).
 */

export type PaddleEnvironment = "sandbox" | "production";

export type BillingConfig = {
  environment: PaddleEnvironment;
  apiKey: string;
  webhookSecret: string;
  clientToken: string;
  prices: { pro_month: string; pro_year: string; business_month: string };
};

type Env = Record<string, string | undefined>;

const clean = (v: string | undefined) => (v ?? "").trim();

/** The full config, or null when anything needed for checkout is missing ("Billing is not configured yet"). */
export function readBillingConfig(env: Env = process.env): BillingConfig | null {
  const apiKey = clean(env.PADDLE_API_KEY);
  const webhookSecret = clean(env.PADDLE_WEBHOOK_SECRET);
  const clientToken = clean(env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN);
  const prices = {
    pro_month: clean(env.PADDLE_PRICE_PRO_MONTHLY),
    pro_year: clean(env.PADDLE_PRICE_PRO_YEARLY),
    business_month: clean(env.PADDLE_PRICE_BUSINESS_MONTHLY),
  };
  if (!apiKey || !webhookSecret || !clientToken || !prices.pro_month || !prices.pro_year || !prices.business_month) return null;
  return { environment: clean(env.PADDLE_ENV) === "production" ? "production" : "sandbox", apiKey, webhookSecret, clientToken, prices };
}

export const billingConfigured = (env: Env = process.env) => readBillingConfig(env) !== null;

/** The price id to charge for a plan + interval, or null when that combination is not sold (business has no yearly price). */
export function priceIdFor(plan: PaidPlanKey, interval: BillingInterval, config: Pick<BillingConfig, "prices">): string | null {
  if (plan === "pro") return interval === "month" ? config.prices.pro_month : config.prices.pro_year;
  return interval === "month" ? config.prices.business_month : null;
}

/** The plan and interval a price id stands for, or null for any id that is not ours. */
export function planForPriceId(priceId: string | null | undefined, config: Pick<BillingConfig, "prices">): { plan: PaidPlanKey; interval: BillingInterval } | null {
  if (!priceId) return null;
  const { prices } = config;
  if (priceId === prices.pro_month) return { plan: "pro", interval: "month" };
  if (priceId === prices.pro_year) return { plan: "pro", interval: "year" };
  if (priceId === prices.business_month) return { plan: "business", interval: "month" };
  return null;
}
