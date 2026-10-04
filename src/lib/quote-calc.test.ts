import { describe, expect, it } from "vitest";
import {
  applyMarkup,
  calculateLine,
  calculateQuoteTotals,
  defaultValidUntil,
  depositCents,
  formatDocNumber,
  isValidDateString,
  todayInTimezone,
} from "./quote-calc";

describe("calculateLine", () => {
  it("multiplies whole and fractional quantities", () => {
    expect(calculateLine(1, 12000)).toBe(12000);
    expect(calculateLine(1.5, 9500)).toBe(14250); // 1.5 hours
    expect(calculateLine(2.5, 6500)).toBe(16250);
  });
  it("rounds half cents away from zero and avoids float error", () => {
    expect(calculateLine(0.5, 1)).toBe(1);
    expect(calculateLine(1.15, 100)).toBe(115);
    expect(calculateLine(0.1, 3)).toBe(0);
    expect(calculateLine(3, 1999)).toBe(5997);
  });
  it("is zero for zero qty or rate", () => {
    expect(calculateLine(0, 5000)).toBe(0);
    expect(calculateLine(4, 0)).toBe(0);
  });
});

describe("calculateQuoteTotals", () => {
  const reference = [
    { qty: 1, unitRateCents: 12000 },
    { qty: 1, unitRateCents: 6500 },
    { qty: 1, unitRateCents: 8000 },
    { qty: 1, unitRateCents: 4500 },
  ];
  it("matches the design reference: $310.00 + 8% = $24.80 -> $334.80", () => {
    expect(calculateQuoteTotals(reference, true, 800)).toEqual({
      subtotalCents: 31000,
      taxCents: 2480,
      totalCents: 33480,
      lineAmountsCents: [12000, 6500, 8000, 4500],
    });
  });
  it("applies 20% VAT", () => {
    const r = calculateQuoteTotals([{ qty: 3, unitRateCents: 8333 }], true, 2000);
    expect(r.subtotalCents).toBe(24999);
    expect(r.taxCents).toBe(5000); // 4999.8 -> 5000
    expect(r.totalCents).toBe(29999);
  });
  it("rounds tax once on the subtotal, not per line", () => {
    // Per-line rounding would give 3 + 3 = 6; on the subtotal 0.08 x 75 = 6.
    const r = calculateQuoteTotals(
      [
        { qty: 1, unitRateCents: 37 },
        { qty: 1, unitRateCents: 38 },
      ],
      true,
      800,
    );
    expect(r.subtotalCents).toBe(75);
    expect(r.taxCents).toBe(6);
  });
  it("adds no tax when disabled, whatever the rate", () => {
    const r = calculateQuoteTotals(reference, false, 2000);
    expect(r.taxCents).toBe(0);
    expect(r.totalCents).toBe(31000);
  });
  it("handles zero items", () => {
    expect(calculateQuoteTotals([], true, 800)).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
      lineAmountsCents: [],
    });
  });
  it("includes decimal quantities", () => {
    const r = calculateQuoteTotals(
      [
        { qty: 1.5, unitRateCents: 9500 },
        { qty: 2, unitRateCents: 1440 },
      ],
      true,
      800,
    );
    expect(r.subtotalCents).toBe(14250 + 2880);
    expect(r.taxCents).toBe(1370); // 17130 x 8% = 1370.4
  });
});

describe("depositCents", () => {
  it("takes 30% of the total", () => {
    expect(depositCents(33480, 3000)).toBe(10044);
  });
  it("rounds half up and handles zero", () => {
    expect(depositCents(5, 3000)).toBe(2); // 1.5
    expect(depositCents(0, 3000)).toBe(0);
    expect(depositCents(10000, 10000)).toBe(10000);
  });
});

describe("applyMarkup", () => {
  it("adds the markup to the rate", () => {
    expect(applyMarkup(1200, 2000)).toBe(1440);
    expect(applyMarkup(1800, 2500)).toBe(2250);
    expect(applyMarkup(8000, 0)).toBe(8000);
  });
});

describe("dates", () => {
  it("adds validity days across month and year ends", () => {
    expect(defaultValidUntil("2026-10-04", 30)).toBe("2026-11-03");
    expect(defaultValidUntil("2026-12-20", 14)).toBe("2027-01-03");
    expect(defaultValidUntil("2028-02-20", 14)).toBe("2028-03-05"); // leap year
    expect(defaultValidUntil("2026-03-28", 14)).toBe("2026-04-11"); // DST weekend
  });
  it("validates yyyy-mm-dd strings", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("28/10/2026")).toBe(false);
    expect(() => defaultValidUntil("nope", 5)).toThrow();
  });
  it("finds today's date in a business timezone", () => {
    const now = new Date("2026-10-04T23:30:00Z");
    expect(todayInTimezone("America/New_York", now)).toBe("2026-10-04");
    expect(todayInTimezone("Australia/Sydney", now)).toBe("2026-10-05");
  });
});

describe("formatDocNumber", () => {
  it("joins prefix and number", () => {
    expect(formatDocNumber("", 1047)).toBe("1047");
    expect(formatDocNumber("QU-", 1047)).toBe("QU-1047");
  });
});
