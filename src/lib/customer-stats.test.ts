import { describe, expect, it } from "vitest";
import { summariseCustomer, type CustomerInvoice } from "./customer-stats";

const today = "2026-10-14";
const invoice = (o: Partial<CustomerInvoice>): CustomerInvoice => ({
  status: "sent",
  dueDate: "2026-10-30",
  totalCents: 10000,
  amountPaidCents: 0,
  updatedAt: "2026-10-01T10:00:00Z",
  ...o,
});

describe("summariseCustomer", () => {
  it("is all zeros with no documents", () => {
    expect(summariseCustomer({ quotes: [], invoices: [], today })).toEqual({
      totalPaidCents: 0,
      outstandingCents: 0,
      overdueCents: 0,
      quoteCount: 0,
      invoiceCount: 0,
      lastActivityAt: null,
    });
  });
  it("adds up paid, outstanding and overdue with the derived rule", () => {
    const s = summariseCustomer({
      quotes: [{ status: "accepted", updatedAt: "2026-09-01T00:00:00Z" }, { status: "sent", updatedAt: "2026-09-02T00:00:00Z" }],
      invoices: [
        invoice({ status: "paid", amountPaidCents: 10000 }),
        invoice({ status: "sent", totalCents: 20000, amountPaidCents: 5000 }),
        invoice({ status: "viewed", dueDate: "2026-10-01", totalCents: 8000 }),
        invoice({ status: "draft", totalCents: 99999 }),
      ],
      today,
    });
    expect(s.totalPaidCents).toBe(15000);
    expect(s.outstandingCents).toBe(15000 + 8000);
    expect(s.overdueCents).toBe(8000);
    expect(s.quoteCount).toBe(2);
    expect(s.invoiceCount).toBe(4);
  });
  it("ignores void invoices for money but still counts them as documents", () => {
    const s = summariseCustomer({ quotes: [], invoices: [invoice({ status: "void", amountPaidCents: 0, totalCents: 5000 })], today });
    expect(s.outstandingCents).toBe(0);
    expect(s.totalPaidCents).toBe(0);
    expect(s.invoiceCount).toBe(1);
  });
  it("last activity is the newest timestamp across quotes and invoices", () => {
    const s = summariseCustomer({
      quotes: [{ status: "sent", updatedAt: "2026-09-02T00:00:00Z", sentAt: "2026-10-05T00:00:00Z" }],
      invoices: [invoice({ updatedAt: "2026-10-03T00:00:00Z", paidAt: "2026-10-09T00:00:00Z" })],
      today,
    });
    expect(s.lastActivityAt).toBe("2026-10-09T00:00:00Z");
  });
});
