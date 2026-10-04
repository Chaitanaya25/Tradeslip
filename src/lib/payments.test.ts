import { describe, expect, it } from "vitest";
import { validatePaymentInput } from "./payments";
import { recordPaymentInputSchema, voidInputSchema } from "./schemas/payment";
import { invoiceInputSchema } from "./schemas/invoice";
import { buildInvoiceDuplicatePayload, buildInvoicePayload, describeInvoiceActivity } from "./invoice-helpers";

const today = "2026-06-15";

describe("validatePaymentInput", () => {
  const ok = (amount: number, remaining = 10000, method = "cash", date = today) => validatePaymentInput(amount, remaining, method, date, today);
  it("accepts a valid payment, including the exact remaining balance", () => {
    expect(ok(2500)).toEqual({ ok: true });
    expect(ok(10000)).toEqual({ ok: true });
  });
  it("rejects zero, negative and fractional-cent amounts", () => {
    expect(ok(0)).toMatchObject({ ok: false, field: "amount" });
    expect(ok(-100)).toMatchObject({ ok: false, field: "amount" });
    expect(ok(10.5)).toMatchObject({ ok: false, field: "amount" });
  });
  it("rejects more than the remaining balance", () => {
    expect(ok(10001)).toMatchObject({ ok: false, field: "amount", message: "That is more than the balance still owed." });
    expect(ok(1, 0)).toMatchObject({ ok: false, field: "amount" });
  });
  it("accepts every method and rejects unknown ones", () => {
    for (const m of ["cash", "card", "bank_transfer", "cheque", "other"]) expect(ok(100, 10000, m).ok).toBe(true);
    expect(ok(100, 10000, "bitcoin")).toMatchObject({ ok: false, field: "method" });
  });
  it("allows today, the past and one day of slack, but not further ahead", () => {
    expect(ok(100, 10000, "cash", "2026-01-01").ok).toBe(true);
    expect(ok(100, 10000, "cash", "2026-06-16").ok).toBe(true);
    expect(ok(100, 10000, "cash", "2026-06-17")).toMatchObject({ ok: false, field: "date" });
    expect(ok(100, 10000, "cash", "2026-13-40")).toMatchObject({ ok: false, field: "date" });
  });
  it("one day ahead works across a month end", () => {
    expect(validatePaymentInput(1, 1, "cash", "2026-07-01", "2026-06-30").ok).toBe(true);
    expect(validatePaymentInput(1, 1, "cash", "2026-07-02", "2026-06-30").ok).toBe(false);
  });
});

describe("recordPaymentInputSchema", () => {
  const key = "3f2b6c1e-5d4a-4c8e-9a7b-1e2d3c4b5a69";
  const base = { amount: "$1,250.50", method: "bank_transfer", paid_on: "2026-06-15", note: " Paid on site ", idempotency_key: key };
  it("parses text to integer cents and trims the note", () => {
    const r = recordPaymentInputSchema.safeParse(base);
    expect(r.success && r.data).toMatchObject({ amount_cents: 125050, method: "bank_transfer", paid_on: "2026-06-15", note: "Paid on site" });
  });
  it("rejects zero, junk, a bad method, a bad date and a bad key", () => {
    for (const bad of [{ amount: "0" }, { amount: "abc" }, { amount: "" }, { method: "x" }, { paid_on: "" }, { paid_on: "2026-02-30" }, { idempotency_key: "nope" }]) {
      expect(recordPaymentInputSchema.safeParse({ ...base, ...bad }).success).toBe(false);
    }
  });
  it("voidInputSchema allows a blank reason and limits its length", () => {
    expect(voidInputSchema.safeParse({ reason: "" }).success).toBe(true);
    expect(voidInputSchema.safeParse({ reason: "x".repeat(301) }).success).toBe(false);
  });
});

describe("invoiceInputSchema", () => {
  const customer = { customer_id: "", name: "Sarah", email: "", phone: "", address_line1: "", city: "", region: "", postcode: "" };
  const item = { description: "Fit tap", type: "labour", qty: "2", rate: "95", price_item_id: "", needs_price: false };
  const base = { customer, title: "", notes: "", issue_date: "2026-06-01", due_date: "2026-06-15", items: [item, { ...item, description: "", rate: "" }] };
  it("parses and drops empty rows", () => {
    const r = invoiceInputSchema.safeParse(base);
    expect(r.success && r.data.items).toHaveLength(1);
    expect(r.success && r.data.items[0].unit_rate_cents).toBe(9500);
  });
  it("rejects a due date before the issue date and missing dates", () => {
    expect(invoiceInputSchema.safeParse({ ...base, due_date: "2026-05-31" }).success).toBe(false);
    expect(invoiceInputSchema.safeParse({ ...base, issue_date: "" }).success).toBe(false);
    expect(invoiceInputSchema.safeParse({ ...base, due_date: "" }).success).toBe(false);
  });
  it("needs a customer name", () => {
    expect(invoiceInputSchema.safeParse({ ...base, customer: { ...customer, name: " " } }).success).toBe(false);
  });
});

describe("buildInvoicePayload", () => {
  const business = { taxEnabled: true, taxRateBps: 800, currency: "USD" };
  const items = [{ description: "Tap", type: "material", qty: 1, unit_rate_cents: 10000, price_item_id: null, needs_price: false }];
  it("recomputes totals from the items, never from the client", () => {
    const p = buildInvoicePayload({ customerId: null, title: null, notes: null, issueDate: "2026-06-01", dueDate: "2026-06-15", items }, business);
    expect(p.fields).toMatchObject({ subtotal_cents: 10000, tax_cents: 800, total_cents: 10800, tax_rate_bps: 800, currency: "USD" });
    expect(p.items[0]).toMatchObject({ position: 0, amount_cents: 10000 });
  });
  it("tax off snapshots a zero rate", () => {
    const p = buildInvoicePayload({ customerId: null, title: null, notes: null, issueDate: "2026-06-01", dueDate: "2026-06-15", items }, { ...business, taxEnabled: false });
    expect(p.fields).toMatchObject({ tax_cents: 0, total_cents: 10000, tax_rate_bps: 0 });
  });
  it("a duplicate restarts the dates from today using payment terms", () => {
    const p = buildInvoiceDuplicatePayload({ customer_id: null, title: "T", notes: null }, items, { ...business, paymentTermsDays: 14 }, "2026-06-15");
    expect(p.fields).toMatchObject({ issue_date: "2026-06-15", due_date: "2026-06-29", title: "T" });
  });
});

describe("describeInvoiceActivity", () => {
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  it("words the payment events", () => {
    expect(describeInvoiceActivity("invoice.payment_recorded", { amount_cents: 5000, method: "bank_transfer" }, money)).toBe("Payment of $50.00 recorded (bank transfer)");
    expect(describeInvoiceActivity("invoice.paid", {}, money)).toBe("Invoice paid in full");
    expect(describeInvoiceActivity("invoice.voided", { reason: "Duplicate" }, money)).toBe("Invoice voided: Duplicate");
    expect(describeInvoiceActivity("invoice.created", { from_quote: 1047 }, money)).toBe("Invoice created from estimate #1047");
    expect(describeInvoiceActivity("invoice.viewed", {}, money)).toBe("Invoice viewed by customer");
  });
});
