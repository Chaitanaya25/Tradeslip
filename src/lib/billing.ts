import { planForPriceId, type BillingConfig } from "./billing-config";
import type { BillingInterval, PaidPlanKey } from "./plans";

/**
 * Turning a verified Paddle event into the columns we store. Pure: no SDK, no network. The plan only ever
 * comes from our env price-id allow-list; `business_id` in custom_data is a hint that the database cross-checks
 * against the customer id it stored when our server created the checkout customer.
 */

export const HANDLED_EVENT_TYPES = [
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "transaction.completed",
  "transaction.payment_failed",
] as const;

export type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "paused" | "canceled";
const PADDLE_STATUSES = ["trialing", "active", "past_due", "paused", "canceled"] as const;

/** The parts of a Paddle event we read. The SDK's event entities satisfy this. */
export type PaddleEventLike = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  data: unknown;
};

export type BillingFields = {
  plan?: PaidPlanKey;
  subscription_status?: SubscriptionStatus;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  billing_interval?: BillingInterval | null;
  paddle_price_id?: string;
  paddle_customer_id?: string;
  paddle_subscription_id?: string;
};

export type MappedEvent =
  | { kind: "apply"; eventId: string; eventType: string; occurredAt: string; businessId: string | null; fields: BillingFields; summary: Record<string, string | null> }
  | { kind: "ignore"; eventId: string; eventType: string; occurredAt: string; reason: string; summary: Record<string, string | null> };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ISO string for a date-like value, or null. */
function iso(v: unknown): string | null {
  const s = v instanceof Date ? v.toISOString() : str(v);
  if (!s) return null;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function firstPriceId(data: Obj): string | null {
  const items = Array.isArray(data.items) ? data.items : [];
  for (const item of items) {
    const price = obj(obj(item)?.price);
    const id = str(price?.id) ?? str(obj(item)?.priceId);
    if (id) return id;
  }
  return null;
}

export function mapPaddleEvent(event: PaddleEventLike, config: Pick<BillingConfig, "prices">): MappedEvent {
  const base = { eventId: event.eventId, eventType: event.eventType, occurredAt: iso(event.occurredAt) ?? new Date().toISOString() };
  const data = obj(event.data) ?? {};
  const customerId = str(data.customerId);
  const summary: Record<string, string | null> = {
    subscription_id: event.eventType.startsWith("subscription.") ? str(data.id) : str(data.subscriptionId),
    customer_id: customerId,
    price_id: firstPriceId(data),
    status: str(data.status),
  };
  const ignore = (reason: string): MappedEvent => ({ kind: "ignore", ...base, reason, summary });

  if (!(HANDLED_EVENT_TYPES as readonly string[]).includes(event.eventType)) return ignore("unhandled_event");
  if (!customerId) return ignore("no_customer");

  const rawBusinessId = str(obj(data.customData)?.business_id);
  const businessId = rawBusinessId && UUID.test(rawBusinessId) ? rawBusinessId.toLowerCase() : null;

  if (event.eventType === "transaction.completed") return ignore("no_state_change");

  if (event.eventType === "transaction.payment_failed") {
    const subscriptionId = str(data.subscriptionId);
    if (!subscriptionId) return ignore("no_subscription");
    return {
      kind: "apply",
      ...base,
      businessId,
      summary,
      fields: { subscription_status: "past_due", paddle_customer_id: customerId, paddle_subscription_id: subscriptionId },
    };
  }

  // subscription.*
  const subscriptionId = str(data.id);
  if (!subscriptionId) return ignore("no_subscription");

  const status =
    event.eventType === "subscription.canceled"
      ? "canceled"
      : event.eventType === "subscription.past_due"
        ? "past_due"
        : event.eventType === "subscription.paused"
          ? "paused"
          : (PADDLE_STATUSES as readonly string[]).includes(str(data.status) ?? "")
            ? (str(data.status) as SubscriptionStatus)
            : null;
  if (!status) return ignore("unknown_status");

  const price = planForPriceId(firstPriceId(data), config);
  if (!price) return ignore("unknown_price");

  const scheduled = obj(data.scheduledChange);
  const cancelScheduled = str(scheduled?.action) === "cancel";
  const periodEnd = iso(obj(data.currentBillingPeriod)?.endsAt);
  let currentPeriodEnd = periodEnd;
  if (status === "canceled") currentPeriodEnd = periodEnd ?? (cancelScheduled ? iso(scheduled?.effectiveAt) : null) ?? iso(data.canceledAt);

  return {
    kind: "apply",
    ...base,
    businessId,
    summary,
    fields: {
      plan: price.plan,
      subscription_status: status,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelScheduled && status !== "canceled",
      billing_interval: price.interval,
      paddle_price_id: firstPriceId(data) as string,
      paddle_customer_id: customerId,
      paddle_subscription_id: subscriptionId,
    },
  };
}

/** What the database function answers. */
export type BillingOutcome =
  | "processed"
  | "already_processed"
  | "ignored_no_change"
  | "ignored_out_of_order"
  | "ignored_unknown_business"
  | "ignored_customer_mismatch"
  | "ignored_subscription_mismatch";

export const BILLING_OUTCOMES: readonly BillingOutcome[] = [
  "processed",
  "already_processed",
  "ignored_no_change",
  "ignored_out_of_order",
  "ignored_unknown_business",
  "ignored_customer_mismatch",
  "ignored_subscription_mismatch",
];

export function isBillingOutcome(v: unknown): v is BillingOutcome {
  return typeof v === "string" && (BILLING_OUTCOMES as readonly string[]).includes(v);
}
