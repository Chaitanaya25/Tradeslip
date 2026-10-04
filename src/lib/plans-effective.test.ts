import { describe, expect, it } from "vitest";
import fixtures from "./plans.fixtures.json";
import {
  GRACE_DAYS,
  PAID_PLAN_KEYS,
  PLANS,
  PLAN_KEYS,
  canUseFeature,
  effectivePlan,
  effectivePlanOf,
  isTrialEnding,
  limitFor,
  planOrFree,
  planPrice,
  showsBrandingFooter,
  trialDaysLeft,
  upgradeMessageFor,
  usageProgress,
  usageRemaining,
  yearlySavingPercent,
  type PlanInput,
} from "./plans";

describe("effectivePlan (shared fixtures; the SQL effective_plan() is checked against the same table)", () => {
  const now = new Date(fixtures.now);
  it.each(fixtures.cases)("$name", (c) => {
    expect(effectivePlan({ plan: c.plan, trial_ends_at: c.trial_ends_at, subscription_status: c.subscription_status, current_period_end: c.current_period_end }, now)).toBe(c.expect);
  });
  it("defaults now to the current time and accepts a business-shaped object", () => {
    const business = { plan: "trial", trial_ends_at: new Date(Date.now() + 86_400_000).toISOString(), subscription_status: "none", current_period_end: null, name: "x" };
    expect(effectivePlanOf(business)).toBe("trial");
    expect(effectivePlan({ ...business, trial_ends_at: new Date(Date.now() - 1000).toISOString() })).toBe("free");
  });
  it("ignores garbage dates instead of throwing", () => {
    expect(effectivePlan({ plan: "pro", trial_ends_at: "nope", subscription_status: "canceled", current_period_end: "also nope" })).toBe("free");
  });
  it("the grace period is seven days", () => {
    expect(GRACE_DAYS).toBe(7);
  });
  it("a raw plan string alone never grants a paid plan", () => {
    for (const plan of ["pro", "business"]) {
      expect(effectivePlan({ plan, trial_ends_at: null, subscription_status: "none", current_period_end: null })).toBe("free");
      expect(effectivePlan({ plan, trial_ends_at: null, subscription_status: null, current_period_end: "2099-01-01T00:00:00Z" })).toBe("free");
    }
  });
});

describe("trial expiry is an instant, not a calendar day", () => {
  // Trial ends 2026-03-10T07:30:00Z: 00:30 on the 10th in Los Angeles (PDT), 20:30 on the 10th in Auckland.
  const ends = "2026-03-10T07:30:00Z";
  const input: PlanInput = { plan: "trial", trial_ends_at: ends, subscription_status: "none", current_period_end: null };
  it("is the same moment everywhere", () => {
    expect(effectivePlan(input, new Date("2026-03-10T07:29:59Z"))).toBe("trial");
    expect(effectivePlan(input, new Date("2026-03-10T07:30:00Z"))).toBe("free");
  });
  it("days left are counted in the business's local days", () => {
    const now = new Date("2026-03-08T07:00:00Z"); // 7 Mar 23:00 PST, 8 Mar 20:00 NZDT
    expect(trialDaysLeft(input, "America/Los_Angeles", now)).toBe(3); // 7 Mar 23:00 PST -> ends 10 Mar 00:30 PDT
    expect(trialDaysLeft(input, "Pacific/Auckland", now)).toBe(2); // ends 10 Mar 20:30 local
    expect(trialDaysLeft(input, "UTC", new Date("2026-03-10T00:00:00Z"))).toBe(0);
    // Just before the trial ends, local midnight in Los Angeles has already passed, so it reads as ending today.
    expect(trialDaysLeft(input, "America/Los_Angeles", new Date("2026-03-10T07:00:00Z"))).toBe(0);
  });
  it("is null when the plan in force is not a trial", () => {
    expect(trialDaysLeft(input, "UTC", new Date("2026-03-11T00:00:00Z"))).toBeNull();
    expect(trialDaysLeft({ ...input, plan: "pro", subscription_status: "active" }, "UTC", new Date("2026-03-08T00:00:00Z"))).toBeNull();
  });
  it("isTrialEnding is true within three days and not before or after", () => {
    expect(isTrialEnding(input, "UTC", new Date("2026-03-06T00:00:00Z"))).toBe(false);
    expect(isTrialEnding(input, "UTC", new Date("2026-03-07T00:00:00Z"))).toBe(true);
    expect(isTrialEnding(input, "UTC", new Date("2026-03-10T07:00:00Z"))).toBe(true);
    expect(isTrialEnding(input, "UTC", new Date("2026-03-10T08:00:00Z"))).toBe(false);
    expect(isTrialEnding(input, "UTC", new Date("2026-03-06T00:00:00Z"), 5)).toBe(true);
  });
});

describe("the plan table", () => {
  it("has exactly free, trial, pro and business", () => {
    expect([...PLAN_KEYS].sort()).toEqual(["business", "free", "pro", "trial"]);
    expect([...PAID_PLAN_KEYS]).toEqual(["pro", "business"]);
  });
  it("keeps the limits the app already enforces", () => {
    expect(PLANS.free.limits).toEqual({ sentQuotesPerMonth: 3, aiDraftsPerMonth: 10 });
    expect(PLANS.trial.limits).toEqual({ sentQuotesPerMonth: null, aiDraftsPerMonth: 10 });
    expect(PLANS.pro.limits).toEqual({ sentQuotesPerMonth: null, aiDraftsPerMonth: 300 });
    expect(PLANS.business.limits).toEqual({ sentQuotesPerMonth: null, aiDraftsPerMonth: 300 });
  });
  it("gates features per plan", () => {
    expect(canUseFeature("free", "reminders")).toBe(false);
    for (const p of ["trial", "pro", "business"] as const) expect(canUseFeature(p, "reminders")).toBe(true);
    expect(showsBrandingFooter("free")).toBe(true);
    expect(showsBrandingFooter("trial")).toBe(true);
    expect(showsBrandingFooter("pro")).toBe(false);
    expect(showsBrandingFooter("business")).toBe(false);
    for (const f of ["depositsTracking", "recurringInvoices", "profitPerJob", "reviewRequests"] as const) {
      expect(canUseFeature("business", f)).toBe(true);
      for (const p of ["free", "trial", "pro"] as const) expect(canUseFeature(p, f)).toBe(false);
    }
  });
  it("sells only pro and business, in every currency, with sensible prices", () => {
    expect(PLANS.free.prices).toBeNull();
    expect(PLANS.trial.prices).toBeNull();
    for (const currency of ["USD", "GBP", "AUD"] as const) {
      const pro = PLANS.pro.prices![currency];
      const business = PLANS.business.prices![currency];
      expect(Number.isInteger(pro.month) && Number.isInteger(business.month)).toBe(true);
      expect(pro.month).toBeGreaterThan(0);
      expect(business.month).toBeGreaterThan(pro.month);
      expect(pro.year).not.toBeNull();
      expect(pro.year!).toBeLessThan(pro.month * 12);
      expect(pro.year!).toBeGreaterThan(pro.month * 6);
      expect(business.year).toBeNull();
    }
    expect(planPrice("pro", "USD", "month")).toBe(1900);
    expect(planPrice("pro", "USD", "year")).toBe(16900);
    expect(planPrice("business", "USD", "month")).toBe(3900);
    expect(planPrice("business", "GBP", "year")).toBeNull();
    expect(planPrice("free", "USD", "month")).toBeNull();
    expect(planPrice("pro", "GBP", "month")).toBe(1500);
    expect(planPrice("pro", "AUD", "year")).toBe(25900);
  });
  it("works out the yearly saving", () => {
    expect(yearlySavingPercent("pro", "USD")).toBe(26);
    expect(yearlySavingPercent("business", "USD")).toBeNull();
    expect(yearlySavingPercent("free", "USD")).toBeNull();
  });
  it("every plan has plain highlights", () => {
    for (const p of PLAN_KEYS) expect(PLANS[p].highlights.length).toBeGreaterThan(1);
  });
  it("planOrFree treats unknown strings as free", () => {
    expect(planOrFree("pro")).toBe("pro");
    expect(planOrFree("enterprise")).toBe("free");
    expect(planOrFree("")).toBe("free");
  });
});

describe("limits and usage", () => {
  it("limitFor and usageRemaining follow the table", () => {
    expect(limitFor("free", "quote_send")).toBe(3);
    expect(limitFor("pro", "quote_send")).toBeNull();
    expect(limitFor("free", "ai_draft")).toBe(10);
    expect(limitFor("business", "ai_draft")).toBe(300);
    expect(usageRemaining("free", { quotesSent: 2, aiDrafts: 4 })).toEqual({ quotes: 1, aiDrafts: 6 });
    expect(usageRemaining("free", { quotesSent: 5, aiDrafts: 99 })).toEqual({ quotes: 0, aiDrafts: 0 });
    expect(usageRemaining("pro", { quotesSent: 50, aiDrafts: 10 })).toEqual({ quotes: null, aiDrafts: 290 });
  });
  it("usageProgress", () => {
    expect(usageProgress(0, 3)).toEqual({ used: 0, limit: 3, percent: 0, state: "ok" });
    expect(usageProgress(2, 3)).toMatchObject({ percent: 67, state: "ok" });
    expect(usageProgress(8, 10)).toMatchObject({ percent: 80, state: "near" });
    expect(usageProgress(3, 3)).toMatchObject({ percent: 100, state: "full" });
    expect(usageProgress(9, 3)).toMatchObject({ percent: 100, state: "full" });
    expect(usageProgress(50, null)).toEqual({ used: 50, limit: null, percent: 0, state: "unlimited" });
    expect(usageProgress(-4, 3)).toMatchObject({ used: 0, percent: 0 });
    expect(usageProgress(1, 0)).toMatchObject({ state: "full" });
  });
});

describe("upgradeMessageFor", () => {
  it("has a title, a body and a benefit for every limit", () => {
    for (const kind of ["quote_send", "ai_draft", "reminders"] as const) {
      const m = upgradeMessageFor(kind, { plan: "free", quoteWord: "Estimate" });
      expect(m.title.length).toBeGreaterThan(5);
      expect(m.body.length).toBeGreaterThan(20);
      expect(m.benefit.length).toBeGreaterThan(20);
    }
  });
  it("names the real numbers", () => {
    expect(upgradeMessageFor("quote_send", { quoteWord: "Estimate" }).body).toMatch(/3 estimates this month/);
    expect(upgradeMessageFor("ai_draft", { plan: "free" }).body).toMatch(/10 voice drafts/);
    expect(upgradeMessageFor("ai_draft", { plan: "free" }).benefit).toMatch(/300/);
  });
});
