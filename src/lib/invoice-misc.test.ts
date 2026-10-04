import { describe, expect, it } from "vitest";
import { invoiceErrorMessage } from "./invoice-errors";
import { buildPublicInvoiceUrl, buildPublicUrl } from "./share-links";

describe("buildPublicInvoiceUrl", () => {
  it("uses /i/ for invoices and keeps /q/ for quotes", () => {
    expect(buildPublicInvoiceUrl("http://localhost:3000/", "abc")).toBe("http://localhost:3000/i/abc");
    expect(buildPublicUrl("http://localhost:3000", "abc")).toBe("http://localhost:3000/q/abc");
  });
});

describe("invoiceErrorMessage", () => {
  const fallback = "Try again.";
  it("passes through the plain messages the database raises for fixable cases", () => {
    expect(invoiceErrorMessage({ code: "22003", message: "That is more than the balance still owed." }, fallback)).toBe("That is more than the balance still owed.");
    expect(invoiceErrorMessage({ code: "55000", message: "An invoice with payments recorded can't be voided." }, fallback)).toBe("An invoice with payments recorded can't be voided.");
    expect(invoiceErrorMessage({ code: "55000", message: "Only accepted quotes can be invoiced." }, fallback)).toBe("Only accepted quotes can be invoiced.");
  });
  it("hides anything it does not recognise", () => {
    expect(invoiceErrorMessage({ code: "55000", message: "Payments can only be recorded with record_invoice_payment()." }, fallback)).toBe(fallback);
    expect(invoiceErrorMessage({ code: "XX000", message: "secret internals" }, fallback)).toBe(fallback);
  });
  it("maps not-found, duplicate and a missing migration", () => {
    expect(invoiceErrorMessage({ code: "42501", message: "Invoice not found." }, fallback)).toBe("That invoice no longer exists.");
    expect(invoiceErrorMessage({ code: "42501" }, fallback, "That quote no longer exists.")).toBe("That quote no longer exists.");
    expect(invoiceErrorMessage({ code: "23505" }, fallback)).toBe("An invoice already exists for this estimate.");
    expect(invoiceErrorMessage({ code: "PGRST202", message: "Could not find the function public.save_invoice" }, fallback)).toContain("009_invoices.sql");
  });
});
