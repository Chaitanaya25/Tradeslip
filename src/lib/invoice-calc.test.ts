import { describe, expect, it } from "vitest";
import {
  daysOverdue,
  defaultDueDate,
  derivedStatus,
  formatDocNumber,
  isFullyPaid,
  remainingCents,
  summariseInvoices,
  todayInTimezone,
} from "./invoice-calc";
import { calculateQuoteTotals } from "./quote-calc";

describe("remaining and fully paid", () => {
  it("never goes below zero", () => {
    expect(remainingCents(10000, 4000)).toBe(6000);
    expect(remainingCents(10000, 10000)).toBe(0);
    expect(remainingCents(10000, 12000)).toBe(0);
  });
  it("is fully paid only when something was owed and it is covered", () => {
    expect(isFullyPaid(10000, 10000)).toBe(true);
    expect(isFullyPaid(10000, 9999)).toBe(false);
    expect(isFullyPaid(0, 0)).toBe(false);
  });
  it("sums partial payments exactly in cents (no float drift)", () => {
    const totals = calculateQuoteTotals([{ qty: 3, unitRateCents: 3333 }], true, 825);
    let paid = 0;
    for (const p of [1000, 2000, 3000]) paid += p;
    expect(totals.totalCents - paid).toBe(remainingCents(totals.totalCents, paid));
    expect(Number.isInteger(remainingCents(totals.totalCents, paid))).toBe(true);
  });
});

describe("derivedStatus", () => {
  const today = "2026-06-15";
  const cases: [string, Parameters<typeof derivedStatus>, string][] = [
    ["draft stays draft even if past due", ["draft", "2026-01-01", today, 5000, 0], "draft"],
    ["void stays void", ["void", "2026-01-01", today, 5000, 0], "void"],
    ["paid stays paid even if past due", ["paid", "2026-01-01", today, 0, 5000], "paid"],
    ["sent, due in future", ["sent", "2026-06-20", today, 5000, 0], "sent"],
    ["viewed, due in future", ["viewed", "2026-06-20", today, 5000, 0], "viewed"],
    ["due today is not overdue", ["sent", today, today, 5000, 0], "sent"],
    ["due yesterday is overdue", ["sent", "2026-06-14", today, 5000, 0], "overdue"],
    ["viewed and past due is overdue", ["viewed", "2026-06-01", today, 5000, 0], "overdue"],
    ["some paid, not due yet = partial", ["sent", "2026-06-20", today, 3000, 2000], "partial"],
    ["some paid, viewed, not due = partial", ["viewed", "2026-06-20", today, 3000, 2000], "partial"],
    ["partial but past due: overdue wins", ["sent", "2026-06-01", today, 3000, 2000], "overdue"],
    ["nothing remaining is never overdue", ["sent", "2026-06-01", today, 0, 5000], "sent"],
  ];
  it.each(cases)("%s", (_name, args, expected) => {
    expect(derivedStatus(...args)).toBe(expected);
  });
});

describe("overdue around timezone midnight", () => {
  // 2026-03-10T11:30Z is already 12 March 00:30 in Auckland (NZDT, UTC+13) but 10 March in UTC and 9 March in Los Angeles.
  const instant = new Date("2026-03-10T11:30:00Z");
  it("uses the business-local date", () => {
    expect(todayInTimezone("Pacific/Auckland", instant)).toBe("2026-03-11");
    expect(todayInTimezone("UTC", instant)).toBe("2026-03-10");
    expect(todayInTimezone("America/Los_Angeles", instant)).toBe("2026-03-10");
  });
  it("an invoice due on the 10th is overdue in Auckland but not yet in UTC", () => {
    const due = "2026-03-10";
    expect(derivedStatus("sent", due, todayInTimezone("Pacific/Auckland", instant), 100)).toBe("overdue");
    expect(derivedStatus("sent", due, todayInTimezone("UTC", instant), 100)).toBe("sent");
  });
  it("flips at local midnight", () => {
    const due = "2026-03-10";
    const before = new Date("2026-03-11T06:59:59Z"); // 23:59:59 on 10 March in Los Angeles (PDT, UTC-7)
    const after = new Date("2026-03-11T07:00:00Z"); // 00:00 on 11 March
    expect(derivedStatus("sent", due, todayInTimezone("America/Los_Angeles", before), 100)).toBe("sent");
    expect(derivedStatus("sent", due, todayInTimezone("America/Los_Angeles", after), 100)).toBe("overdue");
  });
});

describe("daysOverdue", () => {
  it("counts whole days and is 0 when not late", () => {
    expect(daysOverdue("2026-06-10", "2026-06-15")).toBe(5);
    expect(daysOverdue("2026-06-14", "2026-06-15")).toBe(1);
    expect(daysOverdue("2026-06-15", "2026-06-15")).toBe(0);
    expect(daysOverdue("2026-06-20", "2026-06-15")).toBe(0);
  });
  it("is not thrown by month ends or leap days", () => {
    expect(daysOverdue("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysOverdue("2027-02-28", "2027-03-01")).toBe(1);
  });
});

describe("defaultDueDate", () => {
  it("adds payment terms", () => {
    expect(defaultDueDate("2026-06-15", 0)).toBe("2026-06-15");
    expect(defaultDueDate("2026-06-15", 14)).toBe("2026-06-29");
    expect(defaultDueDate("2026-06-15", 30)).toBe("2026-07-15");
  });
  it("handles month ends, year ends and leap days", () => {
    expect(defaultDueDate("2026-01-31", 30)).toBe("2026-03-02");
    expect(defaultDueDate("2026-12-20", 14)).toBe("2027-01-03");
    expect(defaultDueDate("2028-02-15", 14)).toBe("2028-02-29");
    expect(defaultDueDate("2027-02-15", 14)).toBe("2027-03-01");
  });
});

describe("formatDocNumber", () => {
  it("applies the invoice prefix", () => {
    expect(formatDocNumber("INV-", 1001)).toBe("INV-1001");
    expect(formatDocNumber("", 7)).toBe("7");
  });
});

describe("summariseInvoices", () => {
  const today = "2026-06-15";
  const rows = [
    { status: "sent" as const, dueDate: "2026-06-30", totalCents: 10000, amountPaidCents: 0 },
    { status: "viewed" as const, dueDate: "2026-06-01", totalCents: 20000, amountPaidCents: 5000 },
    { status: "paid" as const, dueDate: "2026-05-01", totalCents: 8000, amountPaidCents: 8000 },
    { status: "draft" as const, dueDate: "2026-05-01", totalCents: 99999, amountPaidCents: 0 },
    { status: "void" as const, dueDate: "2026-05-01", totalCents: 5000, amountPaidCents: 0 },
  ];
  const payments = [
    { amountCents: 5000, paidOn: "2026-06-03", invoiceStatus: "viewed" as const },
    { amountCents: 8000, paidOn: "2026-05-20", invoiceStatus: "paid" as const },
    { amountCents: 700, paidOn: "2026-06-10", invoiceStatus: "void" as const },
  ];
  it("owed includes overdue; overdue is the late part", () => {
    const s = summariseInvoices(rows, payments, today);
    expect(s.owedCents).toBe(10000 + 15000);
    expect(s.owedCount).toBe(2);
    expect(s.overdueCents).toBe(15000);
    expect(s.overdueCount).toBe(1);
  });
  it("counts payments by their own date and ignores void invoices", () => {
    const s = summariseInvoices(rows, payments, today);
    expect(s.paidThisMonthCents).toBe(5000);
    expect(s.paidLastMonthCents).toBe(8000);
  });
  it("last month wraps across the year boundary", () => {
    const s = summariseInvoices([], [{ amountCents: 123, paidOn: "2025-12-31", invoiceStatus: "paid" }], "2026-01-02");
    expect(s.paidLastMonthCents).toBe(123);
  });
});
