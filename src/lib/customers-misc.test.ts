import { describe, expect, it } from "vitest";
import { describeAnyActivity, describeCustomerActivity } from "./activity";
import { customerInputSchema, emptyCustomerForm } from "./schemas/customer";

describe("customerInputSchema", () => {
  const base = { ...emptyCustomerForm(), name: "  Sarah Thompson " };
  it("trims, nulls blanks and defaults allow_duplicate to false", () => {
    const r = customerInputSchema.safeParse({ ...base, email: " sarah@example.com ", phone: "(413) 555-0182", notes: "Gate code 1234" });
    expect(r.success && r.data).toMatchObject({ name: "Sarah Thompson", email: "sarah@example.com", phone: "(413) 555-0182", address_line1: null, notes: "Gate code 1234", allow_duplicate: false });
  });
  it("requires a name and a sane email and phone", () => {
    expect(customerInputSchema.safeParse({ ...base, name: " " }).success).toBe(false);
    expect(customerInputSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ ...base, phone: "abc" }).success).toBe(false);
    expect(customerInputSchema.safeParse({ ...base, email: "", phone: "" }).success).toBe(true);
  });
  it("limits lengths", () => {
    expect(customerInputSchema.safeParse({ ...base, name: "x".repeat(81) }).success).toBe(false);
    expect(customerInputSchema.safeParse({ ...base, notes: "x".repeat(2001) }).success).toBe(false);
  });
  it("carries the override flag", () => {
    const r = customerInputSchema.safeParse({ ...base, allow_duplicate: true });
    expect(r.success && r.data.allow_duplicate).toBe(true);
  });
});

describe("activity wording", () => {
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const ctx = { quoteWord: "Estimate", money };
  it("customer events", () => {
    expect(describeCustomerActivity("customer.created")).toBe("Customer added");
    expect(describeCustomerActivity("customer.updated")).toBe("Customer details updated");
    expect(describeCustomerActivity("customer.archived")).toBe("Customer archived");
  });
  it("dispatches by prefix and adds the subject", () => {
    expect(describeAnyActivity("customer.created", {}, ctx)).toBe("Customer added");
    expect(describeAnyActivity("quote.viewed", {}, ctx)).toBe("Estimate viewed by customer");
    expect(describeAnyActivity("invoice.paid", {}, { ...ctx, subject: "Invoice #1001" })).toBe("Invoice #1001: Invoice paid in full");
    expect(describeAnyActivity("quote.scheduled", { when: "14 Oct, 9:30 am" }, ctx)).toBe("Job scheduled for 14 Oct, 9:30 am");
    expect(describeAnyActivity("quote.scheduled", {}, ctx)).toBe("Job schedule cleared");
  });
});
