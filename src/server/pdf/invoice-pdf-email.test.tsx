// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createElement } from "react";
import { render } from "@react-email/components";
import { buildInvoiceDocument, invoicePdfFilename } from "@/lib/invoice-document";
import { isPublicInvoiceResult, isVoidInvoice, type PublicInvoice } from "@/lib/public-invoice";
import { InvoiceToCustomerEmail } from "@/server/email/templates/invoice-to-customer";
import { OwnerNotificationEmail, ownerNotificationSubject } from "@/server/email/templates/owner-notification";
import { renderInvoicePdfBuffer } from "./render";

const pub: PublicInvoice = {
  invoice: {
    number: 1001,
    number_prefix: "INV-",
    status: "sent",
    title: "Kitchen tap replacement",
    notes: "Bank transfer preferred.",
    issue_date: "2026-10-01",
    due_date: "2026-10-15",
    subtotal_cents: 31000,
    tax_cents: 2480,
    total_cents: 33480,
    amount_paid_cents: 0,
    remaining_cents: 33480,
    days_overdue: 0,
    currency: "USD",
    tax_rate_bps: 800,
    paid_at: null,
  },
  items: [
    { description: "Kitchen mixer tap replacement — labour", qty: 1, unit_rate_cents: 12000, amount_cents: 12000, position: 0 },
    { description: "Leak repair under sink — labour", qty: 1, unit_rate_cents: 6500, amount_cents: 6500, position: 1 },
    { description: "Hourly labour", qty: 1.5, unit_rate_cents: 9500, amount_cents: 14250, position: 2 },
  ],
  customer: { name: "Sarah Thompson", address_line1: "42 Maple Avenue", city: "Springfield", region: "MA", postcode: "01103" },
  business: {
    name: "Miller Plumbing",
    country: "US",
    timezone: "America/New_York",
    logo_path: null,
    phone: "(555) 214-8890",
    email: "dave@example.com",
    tax_number: null,
    tax_label: "Sales tax",
    payment_link_url: "https://pay.example.com/miller",
    plan_branding: true,
  },
};

const lines = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    description: `Line item number ${i + 1}`,
    qty: 1,
    unit_rate_cents: 1000 + i * 125,
    amount_cents: 1000 + i * 125,
    position: i,
  }));

const pageCount = (buffer: Buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const partly: PublicInvoice = { ...pub, invoice: { ...pub.invoice, amount_paid_cents: 10000, remaining_cents: 23480, status: "partial" } };

describe("buildInvoiceDocument", () => {
  it("formats the invoice like the page: number, dates, totals, payment link", () => {
    const d = buildInvoiceDocument(pub, { logoUrl: null });
    expect(d.word).toBe("Invoice");
    expect(d.number).toBe("INV-1001");
    expect(d.issueDate).toBe("Oct 1, 2026");
    expect(d.dueDate).toBe("Oct 15, 2026");
    expect(d.total).toBe("$334.80");
    expect(d.tax).toEqual({ label: "Sales tax (8%)", amount: "$24.80" });
    expect(d.amountPaid).toBeNull();
    expect(d.paymentUrl).toBe("https://pay.example.com/miller");
    expect(d.branding).toBe("Prepared with Tradeslip");
    expect(d.pageSize).toBe("LETTER");
  });
  it("shows amount paid and balance due when partly paid", () => {
    const d = buildInvoiceDocument(partly, { logoUrl: null });
    expect(d.amountPaid).toBe("$100.00");
    expect(d.balanceDue).toBe("$234.80");
  });
  it("prints no payment link once paid, and drops branding on paid plans", () => {
    const paid: PublicInvoice = { ...pub, invoice: { ...pub.invoice, status: "paid", amount_paid_cents: 33480, remaining_cents: 0 }, business: { ...pub.business, plan_branding: false } };
    const d = buildInvoiceDocument(paid, { logoUrl: null });
    expect(d.paidInFull).toBe(true);
    expect(d.paymentUrl).toBeNull();
    expect(d.branding).toBeNull();
  });
  it("names the file without repeating the prefix", () => {
    expect(invoicePdfFilename(1001)).toBe("Invoice-1001.pdf");
  });
});

describe("InvoiceDocument PDF", () => {
  const renderPdf = (p: PublicInvoice, extra: { isDraft?: boolean } = {}) => renderInvoicePdfBuffer(buildInvoiceDocument(p, { logoUrl: null, ...extra }));

  it("renders a short invoice to a single-page PDF", async () => {
    const buffer = await renderPdf(pub);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(buffer)).toBe(1);
  }, 30_000);
  it("renders a partly paid invoice", async () => {
    expect((await renderPdf(partly)).subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
  it("breaks a 25-line invoice across pages", async () => {
    const buffer = await renderPdf({ ...pub, items: lines(25) });
    expect(pageCount(buffer)).toBeGreaterThanOrEqual(2);
  }, 30_000);
  it("renders with no payment link, long names, no tax and a draft marker", async () => {
    const buffer = await renderPdf(
      {
        ...pub,
        invoice: { ...pub.invoice, tax_rate_bps: 0, tax_cents: 0, notes: null },
        business: { ...pub.business, name: "Miller & Sons Plumbing, Heating and Drainage Specialists Ltd", payment_link_url: null, plan_branding: false },
        customer: { ...pub.customer, name: "Bartholomew Wolfeschlegelsteinhausenbergerdorff-Smythe" },
      },
      { isDraft: true },
    );
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});

describe("public invoice JSON guard", () => {
  it("accepts a full invoice and a minimal void one, rejects junk", () => {
    expect(isPublicInvoiceResult(pub)).toBe(true);
    const voided = { invoice: { number: 1, number_prefix: "", status: "void" }, business: { name: "x" } };
    expect(isPublicInvoiceResult(voided)).toBe(true);
    expect(isVoidInvoice(voided as never)).toBe(true);
    for (const bad of [null, undefined, {}, { invoice: {} }, "x", { invoice: { status: "sent" }, business: {} }]) {
      expect(isPublicInvoiceResult(bad)).toBe(false);
    }
  });
});

describe("invoice emails", () => {
  const base = {
    businessName: "Miller Plumbing",
    logoUrl: null,
    customerName: "Sarah Thompson",
    number: "INV-1001",
    totalText: "$334.80",
    balanceDueText: null as string | null,
    dueDateText: "Oct 15, 2026",
    link: "https://app.test/i/abcdefghijklmnopqrstuvwxyz123456",
    branding: true,
  };
  const clean = (html: string) => html.replace(/<!-- -->/g, "");

  it("renders the customer invoice with the link, total, due date and a plain-text version", async () => {
    const el = createElement(InvoiceToCustomerEmail, base);
    const html = clean(await render(el));
    const text = await render(el, { plainText: true });
    expect(html).toContain("Hi Sarah,");
    expect(html).toContain("$334.80");
    expect(html).toContain("Total due");
    expect(html).toContain("Due Oct 15, 2026");
    expect(html).toContain('href="https://app.test/i/abcdefghijklmnopqrstuvwxyz123456"');
    expect(html).toContain("View invoice");
    expect(html).toContain("Sent with Tradeslip");
    expect(text).toContain("https://app.test/i/abcdefghijklmnopqrstuvwxyz123456");
    expect(text).not.toContain("<");
  });
  it("leads with the balance when part is paid and drops branding on paid plans", async () => {
    const html = clean(await render(createElement(InvoiceToCustomerEmail, { ...base, balanceDueText: "$234.80", branding: false })));
    expect(html).toContain("Balance due");
    expect(html).toContain("$234.80");
    expect(html).toContain("Invoice total $334.80");
    expect(html).not.toContain("Sent with Tradeslip");
  });
  it("renders the owner's first-view notification", async () => {
    const props = { kind: "invoice_viewed" as const, number: "INV-1001", customerName: "Sarah Thompson", link: "https://app.test/invoices/1", businessName: "Miller Plumbing" };
    expect(ownerNotificationSubject(props)).toBe("Sarah Thompson viewed invoice #INV-1001");
    const html = clean(await render(OwnerNotificationEmail(props)));
    expect(html).toContain("just opened invoice #INV-1001");
    expect(html).toContain("Open invoice");
  });
});
