import { describe, expect, it } from "vitest";
import { addCents, formatMoney, multiplyQtyByRateCents, sumCents, taxFromBps } from "./money";

describe("addCents / sumCents", () => {
  it("adds integers exactly", () => {
    expect(addCents(10, 20)).toBe(30);
    expect(sumCents([12000, 6500, 8000, 4500])).toBe(31000);
  });
  it("handles zero and empty", () => {
    expect(addCents(0, 0)).toBe(0);
    expect(sumCents([])).toBe(0);
  });
  it("rejects non-integers", () => {
    expect(() => addCents(1.5, 1)).toThrow();
  });
});

describe("multiplyQtyByRateCents", () => {
  it("multiplies whole quantities", () => {
    expect(multiplyQtyByRateCents(1, 12000)).toBe(12000);
    expect(multiplyQtyByRateCents(3, 8000)).toBe(24000);
  });
  it("avoids float error (0.1 x 3 style cases)", () => {
    expect(multiplyQtyByRateCents(0.1, 3)).toBe(0); // 0.3 cents -> 0
    expect(multiplyQtyByRateCents(1.1, 1000)).toBe(1100);
    expect(multiplyQtyByRateCents(2.3, 100)).toBe(230);
  });
  it("rounds half cents away from zero", () => {
    expect(multiplyQtyByRateCents(0.5, 1)).toBe(1); // 0.5c -> 1c
    expect(multiplyQtyByRateCents(1.5, 3)).toBe(5); // 4.5c -> 5c
    expect(multiplyQtyByRateCents(0.25, 2)).toBe(1); // 0.5c -> 1c
    expect(multiplyQtyByRateCents(0.49, 1)).toBe(0);
    expect(multiplyQtyByRateCents(-1.5, 3)).toBe(-5);
  });
  it("handles fractional hours", () => {
    expect(multiplyQtyByRateCents(2.5, 6500)).toBe(16250);
    expect(multiplyQtyByRateCents(0.75, 6500)).toBe(4875);
    expect(multiplyQtyByRateCents(1.33, 6500)).toBe(8645); // 8645.0
  });
  it("returns 0 for zero qty or zero rate (never -0)", () => {
    expect(multiplyQtyByRateCents(0, 5000)).toBe(0);
    expect(multiplyQtyByRateCents(4, 0)).toBe(0);
    expect(Object.is(multiplyQtyByRateCents(-0.001, 100), 0)).toBe(true);
  });
  it("rejects non-integer rates and non-finite qty", () => {
    expect(() => multiplyQtyByRateCents(1, 10.5)).toThrow();
    expect(() => multiplyQtyByRateCents(Number.NaN, 100)).toThrow();
  });
});

describe("taxFromBps", () => {
  it("computes 8% sales tax (US quote from the design: $310.00 -> $24.80)", () => {
    expect(taxFromBps(31000, 800)).toBe(2480);
  });
  it("computes 20% VAT", () => {
    expect(taxFromBps(10000, 2000)).toBe(2000);
    expect(taxFromBps(8333, 2000)).toBe(1667); // 1666.6 -> 1667
  });
  it("computes 10% GST", () => {
    expect(taxFromBps(12345, 1000)).toBe(1235); // 1234.5 -> 1235
  });
  it("rounds half up at the boundary", () => {
    expect(taxFromBps(1, 5000)).toBe(1); // 0.5c
    expect(taxFromBps(1, 4999)).toBe(0);
    expect(taxFromBps(6, 800)).toBe(0); // 0.48c
    expect(taxFromBps(7, 800)).toBe(1); // 0.56c
  });
  it("returns 0 for zero amount or zero rate", () => {
    expect(taxFromBps(0, 2000)).toBe(0);
    expect(taxFromBps(31000, 0)).toBe(0);
  });
  it("total = subtotal + tax is exact", () => {
    const subtotal = sumCents([12000, 6500, 8000, 4500]);
    expect(addCents(subtotal, taxFromBps(subtotal, 800))).toBe(33480);
  });
});

describe("formatMoney", () => {
  it("formats USD", () => {
    expect(formatMoney(33480, "USD")).toBe("$334.80");
    expect(formatMoney(0, "USD")).toBe("$0.00");
    expect(formatMoney(123456789, "USD")).toBe("$1,234,567.89");
  });
  it("formats GBP and AUD", () => {
    expect(formatMoney(33480, "GBP", "en-GB")).toBe("£334.80");
    expect(formatMoney(33480, "AUD", "en-AU")).toBe("$334.80");
  });
  it("formats negatives and sub-dollar amounts", () => {
    expect(formatMoney(5, "USD")).toBe("$0.05");
    expect(formatMoney(-2500, "USD")).toBe("-$25.00");
  });
});
