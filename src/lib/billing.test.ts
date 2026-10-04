import { describe, expect, it } from "vitest";
import { mapPaddleEvent, isBillingOutcome, type PaddleEventLike } from "./billing";
import { billingConfigured, planForPriceId, priceIdFor, readBillingConfig } from "./billing-config";

const env: Record<string, string> = {
  PADDLE_API_KEY: "pdl_sdbx_apikey_123",
  PADDLE_WEBHOOK_SECRET: "pdl_ntfset_secret",
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_token_123",
  PADDLE_ENV: "sandbox",
  PADDLE_PRICE_PRO_MONTHLY: "pri_pro_m",
  PADDLE_PRICE_PRO_YEARLY: "pri_pro_y",
  PADDLE_PRICE_BUSINESS_MONTHLY: "pri_biz_m",
};
const config = readBillingConfig(env)!;
const BIZ = "11111111-1111-4111-8111-111111111111";

describe("readBillingConfig", () => {
  it("reads the full set and defaults to the sandbox", () => {
    expect(config.environment).toBe("sandbox");
    expect(config.prices).toEqual({ pro_month: "pri_pro_m", pro_year: "pri_pro_y", business_month: "pri_biz_m" });
    expect(readBillingConfig({ ...env, PADDLE_ENV: "production" })?.environment).toBe("production");
    expect(readBillingConfig({ ...env, PADDLE_ENV: "nonsense" })?.environment).toBe("sandbox");
  });
  it("is null (billing not configured) when anything is missing or blank", () => {
    for (const key of Object.keys(env).filter((k) => k !== "PADDLE_ENV")) {
      expect(readBillingConfig({ ...env, [key]: "" })).toBeNull();
      expect(readBillingConfig({ ...env, [key]: "   " })).toBeNull();
      const { [key]: _omit, ...rest } = env;
      void _omit;
      expect(readBillingConfig(rest)).toBeNull();
    }
    expect(billingConfigured({})).toBe(false);
    expect(billingConfigured(env)).toBe(true);
  });
});

describe("price allow-list", () => {
  it("maps plan + interval to our price ids only", () => {
    expect(priceIdFor("pro", "month", config)).toBe("pri_pro_m");
    expect(priceIdFor("pro", "year", config)).toBe("pri_pro_y");
    expect(priceIdFor("business", "month", config)).toBe("pri_biz_m");
    expect(priceIdFor("business", "year", config)).toBeNull();
  });
  it("maps a price id back to a plan, and refuses any other id", () => {
    expect(planForPriceId("pri_pro_y", config)).toEqual({ plan: "pro", interval: "year" });
    expect(planForPriceId("pri_biz_m", config)).toEqual({ plan: "business", interval: "month" });
    for (const bad of ["pri_other", "", null, undefined, "pri_pro_m ", "PRI_PRO_M"]) expect(planForPriceId(bad as never, config)).toBeNull();
  });
});

const sub = (eventType: string, over: Record<string, unknown> = {}, eventOver: Partial<PaddleEventLike> = {}): PaddleEventLike => ({
  eventId: "evt_1",
  eventType,
  occurredAt: "2026-10-14T12:00:00Z",
  data: {
    id: "sub_1",
    status: "active",
    customerId: "ctm_1",
    customData: { business_id: BIZ },
    items: [{ price: { id: "pri_pro_m" } }],
    currentBillingPeriod: { startsAt: "2026-10-14T12:00:00Z", endsAt: "2026-11-14T12:00:00Z" },
    scheduledChange: null,
    canceledAt: null,
    ...over,
  },
  ...eventOver,
});

describe("mapPaddleEvent: subscriptions", () => {
  it("maps an active Pro monthly subscription", () => {
    const m = mapPaddleEvent(sub("subscription.activated"), config);
    expect(m).toMatchObject({
      kind: "apply",
      eventId: "evt_1",
      businessId: BIZ,
      occurredAt: "2026-10-14T12:00:00.000Z",
      fields: {
        plan: "pro",
        subscription_status: "active",
        current_period_end: "2026-11-14T12:00:00.000Z",
        cancel_at_period_end: false,
        billing_interval: "month",
        paddle_price_id: "pri_pro_m",
        paddle_customer_id: "ctm_1",
        paddle_subscription_id: "sub_1",
      },
    });
  });
  it("takes the plan from the price id, never from the event's own words", () => {
    const m = mapPaddleEvent(sub("subscription.created", { items: [{ price: { id: "pri_biz_m" } }], customData: { business_id: BIZ, plan: "pro" } }), config);
    expect(m.kind === "apply" && m.fields.plan).toBe("business");
    const y = mapPaddleEvent(sub("subscription.updated", { items: [{ price: { id: "pri_pro_y" } }] }), config);
    expect(y.kind === "apply" && y.fields.billing_interval).toBe("year");
  });
  it("ignores an unknown price id (and says why)", () => {
    expect(mapPaddleEvent(sub("subscription.created", { items: [{ price: { id: "pri_somebody_elses" } }] }), config)).toMatchObject({ kind: "ignore", reason: "unknown_price" });
    expect(mapPaddleEvent(sub("subscription.created", { items: [] }), config)).toMatchObject({ kind: "ignore", reason: "unknown_price" });
  });
  it("maps trialing, past_due, paused and resumed", () => {
    const status = (type: string, st: string) => {
      const m = mapPaddleEvent(sub(type, { status: st }), config);
      return m.kind === "apply" ? m.fields.subscription_status : m.reason;
    };
    expect(status("subscription.created", "trialing")).toBe("trialing");
    expect(status("subscription.past_due", "past_due")).toBe("past_due");
    expect(status("subscription.paused", "paused")).toBe("paused");
    expect(status("subscription.resumed", "active")).toBe("active");
    expect(status("subscription.updated", "active")).toBe("active");
    expect(status("subscription.updated", "weird")).toBe("unknown_status");
  });
  it("past_due and paused events set that status even if the payload status lags", () => {
    expect(mapPaddleEvent(sub("subscription.past_due", { status: "active" }), config)).toMatchObject({ fields: { subscription_status: "past_due" } });
    expect(mapPaddleEvent(sub("subscription.paused", { status: "active" }), config)).toMatchObject({ fields: { subscription_status: "paused" } });
  });
  it("a scheduled cancellation keeps the subscription active until the period end", () => {
    const m = mapPaddleEvent(sub("subscription.updated", { scheduledChange: { action: "cancel", effectiveAt: "2026-11-14T12:00:00Z" } }), config);
    expect(m).toMatchObject({ fields: { subscription_status: "active", cancel_at_period_end: true, current_period_end: "2026-11-14T12:00:00.000Z" } });
  });
  it("canceled keeps access until the end of what was paid for", () => {
    const withPeriod = mapPaddleEvent(sub("subscription.canceled", { status: "canceled" }), config);
    expect(withPeriod).toMatchObject({ fields: { subscription_status: "canceled", current_period_end: "2026-11-14T12:00:00.000Z", cancel_at_period_end: false } });
    const final = mapPaddleEvent(sub("subscription.canceled", { status: "canceled", currentBillingPeriod: null, canceledAt: "2026-11-14T12:00:00Z" }), config);
    expect(final).toMatchObject({ fields: { subscription_status: "canceled", current_period_end: "2026-11-14T12:00:00.000Z" } });
    const scheduled = mapPaddleEvent(sub("subscription.canceled", { status: "canceled", currentBillingPeriod: null, canceledAt: null, scheduledChange: { action: "cancel", effectiveAt: "2026-11-20T00:00:00Z" } }), config);
    expect(scheduled).toMatchObject({ fields: { current_period_end: "2026-11-20T00:00:00.000Z" } });
  });
  it("accepts a business id only when it is a uuid; otherwise leaves it to the customer-id lookup", () => {
    expect(mapPaddleEvent(sub("subscription.created", { customData: { business_id: "not-a-uuid" } }), config)).toMatchObject({ kind: "apply", businessId: null });
    expect(mapPaddleEvent(sub("subscription.created", { customData: null }), config)).toMatchObject({ kind: "apply", businessId: null });
    expect(mapPaddleEvent(sub("subscription.created", { customData: { business_id: BIZ.toUpperCase() } }), config)).toMatchObject({ businessId: BIZ });
  });
  it("needs a customer and a subscription id", () => {
    expect(mapPaddleEvent(sub("subscription.created", { customerId: null }), config)).toMatchObject({ kind: "ignore", reason: "no_customer" });
    expect(mapPaddleEvent(sub("subscription.created", { id: null }), config)).toMatchObject({ kind: "ignore", reason: "no_subscription" });
  });
});

describe("mapPaddleEvent: transactions and others", () => {
  const txn = (type: string, over: Record<string, unknown> = {}): PaddleEventLike => ({
    eventId: "evt_t",
    eventType: type,
    occurredAt: "2026-10-14T12:00:00Z",
    data: { id: "txn_1", subscriptionId: "sub_1", customerId: "ctm_1", customData: { business_id: BIZ }, status: "completed", ...over },
  });
  it("a failed payment means past due, nothing else changes", () => {
    const m = mapPaddleEvent(txn("transaction.payment_failed"), config);
    expect(m).toMatchObject({ kind: "apply", fields: { subscription_status: "past_due", paddle_customer_id: "ctm_1", paddle_subscription_id: "sub_1" } });
    expect(m.kind === "apply" && Object.keys(m.fields).sort()).toEqual(["paddle_customer_id", "paddle_subscription_id", "subscription_status"]);
  });
  it("a completed payment is recorded but changes no state (the subscription events carry it)", () => {
    expect(mapPaddleEvent(txn("transaction.completed"), config)).toMatchObject({ kind: "ignore", reason: "no_state_change" });
  });
  it("one-off transactions without a subscription are ignored", () => {
    expect(mapPaddleEvent(txn("transaction.payment_failed", { subscriptionId: null }), config)).toMatchObject({ kind: "ignore", reason: "no_subscription" });
  });
  it("other event types are ignored", () => {
    for (const type of ["customer.created", "address.updated", "subscription.trialing", "transaction.billed", ""]) {
      expect(mapPaddleEvent(txn(type), config)).toMatchObject({ kind: "ignore", reason: "unhandled_event" });
    }
  });
  it("never puts personal data in the summary", () => {
    const m = mapPaddleEvent(sub("subscription.created", { customData: { business_id: BIZ, email: "x@y.co" } }), config);
    expect(Object.keys(m.summary).sort()).toEqual(["customer_id", "price_id", "status", "subscription_id"]);
    expect(JSON.stringify(m.summary)).not.toContain("@");
  });
  it("copes with garbage data and bad timestamps", () => {
    expect(mapPaddleEvent({ eventId: "e", eventType: "subscription.created", occurredAt: "nope", data: null }, config)).toMatchObject({ kind: "ignore" });
    expect(mapPaddleEvent({ eventId: "e", eventType: "subscription.created", occurredAt: "nope", data: "x" }, config)).toMatchObject({ kind: "ignore" });
  });
});

describe("isBillingOutcome", () => {
  it("knows the outcomes the database returns", () => {
    for (const ok of ["processed", "already_processed", "ignored_out_of_order", "ignored_customer_mismatch"]) expect(isBillingOutcome(ok)).toBe(true);
    for (const bad of ["", "weird", 1, null, undefined]) expect(isBillingOutcome(bad)).toBe(false);
  });
});
