import { describe, expect, it } from "vitest";
import { buildInvoiceSeries, hasInvoiceData, monthsAgo } from "./chart-data";

describe("monthsAgo", () => {
  it("steps back across year boundaries", () => {
    expect(monthsAgo("2026-10-14", 0)).toBe("2026-10-01");
    expect(monthsAgo("2026-10-14", 5)).toBe("2026-05-01");
    expect(monthsAgo("2026-02-03", 3)).toBe("2025-11-01");
  });
});

describe("buildInvoiceSeries", () => {
  const rows = [
    { month: "2026-08-01", paid_cents: 5000, outstanding_cents: 2000 },
    { month: "2026-10-01", paid_cents: "9000", outstanding_cents: "3000" },
  ];
  it("returns N months oldest first with empty months filled", () => {
    const s = buildInvoiceSeries(rows, 6, "2026-10-14", "en-US");
    expect(s.map((p) => p.label)).toEqual(["May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
    expect(s.map((p) => p.paid)).toEqual([0, 0, 0, 5000, 0, 9000]);
    expect(s.map((p) => p.outstanding)).toEqual([0, 0, 0, 2000, 0, 3000]);
  });
  it("labels per region and accepts numeric strings from the database", () => {
    const s = buildInvoiceSeries(rows, 3, "2026-10-14", "en-GB");
    expect(s.map((p) => p.label.slice(0, 3))).toEqual(["Aug", "Sep", "Oct"]);
    expect(s[2].paid).toBe(9000);
  });
  it("ignores rows outside the window and handles zero rows", () => {
    const s = buildInvoiceSeries([{ month: "2020-01-01", paid_cents: 1, outstanding_cents: 1 }], 3, "2026-10-14", "en-US");
    expect(s.every((p) => p.paid === 0 && p.outstanding === 0)).toBe(true);
    expect(hasInvoiceData(s)).toBe(false);
    expect(hasInvoiceData(buildInvoiceSeries(rows, 6, "2026-10-14", "en-US"))).toBe(true);
  });
  it("always returns at least one month", () => {
    expect(buildInvoiceSeries([], 0, "2026-10-14", "en-US")).toHaveLength(1);
  });
});
