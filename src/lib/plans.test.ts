import { describe, expect, it } from "vitest";
import { FREE_QUOTES_PER_MONTH, quoteLimitMessage, quoteSendLimit, quoteSendsRemaining, AI_DRAFTS_PER_MINUTE, AI_DRAFT_LIMITS, aiDraftLimit, limitReachedMessage, rateLimitWindowStart, usagePeriod } from "./plans";

describe("aiDraftLimit", () => {
  it("matches the plan table", () => {
    expect(AI_DRAFT_LIMITS).toEqual({ trial: 10, free: 10, pro: 300, business: 300 });
    expect(aiDraftLimit("trial")).toBe(10);
    expect(aiDraftLimit("pro")).toBe(300);
    expect(aiDraftLimit("business")).toBe(300);
  });
  it("treats an unknown plan like free", () => {
    expect(aiDraftLimit("enterprise")).toBe(10);
  });
  it("words the limit message with the plan's number", () => {
    expect(limitReachedMessage("free")).toMatch(/10 voice drafts/);
    expect(limitReachedMessage("pro")).toMatch(/300 voice drafts/);
  });
});

describe("usagePeriod", () => {
  it("uses the business timezone's calendar month", () => {
    const now = new Date("2026-10-31T23:30:00Z");
    expect(usagePeriod("America/New_York", now)).toBe("2026-10");
    expect(usagePeriod("Australia/Sydney", now)).toBe("2026-11");
  });
  it("rolls the year over", () => {
    expect(usagePeriod("Pacific/Auckland", new Date("2026-12-31T20:00:00Z"))).toBe("2027-01");
  });
});

describe("rateLimitWindowStart", () => {
  it("floors to the minute so requests in the same minute share a window", () => {
    expect(rateLimitWindowStart(new Date("2026-10-04T10:00:59.999Z"))).toBe("2026-10-04T10:00:00.000Z");
    expect(rateLimitWindowStart(new Date("2026-10-04T10:01:00.000Z"))).toBe("2026-10-04T10:01:00.000Z");
    expect(AI_DRAFTS_PER_MINUTE).toBe(5);
  });
});

describe("free-plan quote limit", () => {
  it("is 3 a month on free and unlimited otherwise", () => {
    expect(FREE_QUOTES_PER_MONTH).toBe(3);
    expect(quoteSendLimit("free")).toBe(3);
    for (const plan of ["trial", "pro", "business"]) expect(quoteSendLimit(plan)).toBeNull();
  });
  it("counts what is left", () => {
    expect(quoteSendsRemaining("free", 0)).toBe(3);
    expect(quoteSendsRemaining("free", 2)).toBe(1);
    expect(quoteSendsRemaining("free", 3)).toBe(0);
    expect(quoteSendsRemaining("free", 9)).toBe(0);
    expect(quoteSendsRemaining("pro", 50)).toBeNull();
  });
  it("words the upgrade message with the document word", () => {
    expect(quoteLimitMessage("Estimate")).toMatch(/3 estimates this month/);
    expect(quoteLimitMessage("Quote")).toMatch(/3 quotes this month/);
  });
});
