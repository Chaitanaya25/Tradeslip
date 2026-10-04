// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createElement } from "react";
import { render } from "@react-email/components";
import { buildQuoteDocument, monogramFor, pdfSafeLogoUrl, qtyText, quotePdfFilename } from "@/lib/quote-document";
import type { PublicQuote } from "@/lib/public-quote";
import { QuoteToCustomerEmail } from "@/server/email/templates/quote-to-customer";
import { OwnerNotificationEmail, ownerNotificationSubject } from "@/server/email/templates/owner-notification";
import { OtpCodeEmail } from "@/server/email/templates/otp-code";
import { formatFrom } from "@/server/email/send";
import { renderQuotePdfBuffer } from "./render";

const pub: PublicQuote = {
  quote: {
    number: 1047,
    number_prefix: "",
    status: "sent",
    title: "Kitchen tap replacement",
    notes: "Old tap will be removed and disposed of.",
    terms: null,
    valid_until: "2026-10-28",
    deposit_enabled: true,
    deposit_bps: 3000,
    include_photos: false,
    subtotal_cents: 31000,
    tax_cents: 2480,
    total_cents: 33480,
    currency: "USD",
    tax_rate_bps: 800,
    accepted_at: null,
    accepted_name: null,
    accepted_verified: false,
    requires_verification: true,
    declined_at: null,
    decline_reason: null,
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
    trade: "Plumber",
    tax_number: null,
    tax_label: "Sales tax",
    payment_link_url: "https://pay.example.com/miller",
    plan_branding: true,
  },
  photos: [],
};

describe("buildQuoteDocument", () => {
  const doc = buildQuoteDocument(pub, { logoUrl: null, photos: [] });
  it("formats money, dates and the deposit like the reference", () => {
    expect(doc.word).toBe("Estimate");
    expect(doc.number).toBe("1047");
    expect(doc.validUntil).toBe("Oct 28, 2026");
    expect(doc.subtotal).toBe("$310.00");
    expect(doc.tax).toEqual({ label: "Sales tax (8%)", amount: "$24.80" });
    expect(doc.total).toBe("$334.80");
    expect(doc.deposit).toEqual({ label: "30% deposit due on acceptance", amount: "$100.44", remaining: "$234.36" });
    expect(doc.items[2]).toMatchObject({ qtyText: "1.5", rateText: "$95.00", amountText: "$142.50" });
    expect(doc.customer.address).toBe("42 Maple Avenue, Springfield, MA 01103");
    expect(doc.pageSize).toBe("LETTER");
  });
  it("shows the Tradeslip line only on branded plans", () => {
    expect(doc.branding).toBe("Prepared with Tradeslip");
    expect(buildQuoteDocument({ ...pub, business: { ...pub.business, plan_branding: false } }, { logoUrl: null, photos: [] }).branding).toBeNull();
  });
  it("omits the tax line when there is no tax and uses A4 + Quote for the UK", () => {
    const uk = buildQuoteDocument(
      { ...pub, quote: { ...pub.quote, tax_rate_bps: 0, tax_cents: 0, currency: "GBP" }, business: { ...pub.business, country: "UK" } },
      { logoUrl: null, photos: [] },
    );
    expect(uk.tax).toBeNull();
    expect(uk.word).toBe("Quote");
    expect(uk.pageSize).toBe("A4");
    expect(uk.total).toBe("£334.80");
    expect(uk.validUntil).toBe("28 Oct 2026");
  });
  it("only includes photos when the quote says so", () => {
    const photos = [{ url: "https://x.test/p.jpg", kind: "before" as const }];
    expect(buildQuoteDocument(pub, { logoUrl: null, photos }).photos).toEqual([]);
    expect(buildQuoteDocument({ ...pub, quote: { ...pub.quote, include_photos: true } }, { logoUrl: null, photos }).photos).toEqual(photos);
  });
  it("helpers", () => {
    expect(pdfSafeLogoUrl("https://x/y.webp")).toBeNull();
    expect(pdfSafeLogoUrl("https://x/y.PNG")).toBe("https://x/y.PNG");
    expect(qtyText(2)).toBe("2");
    expect(qtyText(1.5)).toBe("1.5");
    expect(quotePdfFilename("Estimate", 1047)).toBe("Estimate-1047.pdf");
  });
});

/** Number of pages in a PDF buffer. */
function pageCount(buffer: Buffer): number {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

const lines = (n: number, long = false) =>
  Array.from({ length: n }, (_, i) => ({
    description: long && i === 2
      ? "Remove the existing galvanised supply pipework under the kitchen and utility room floors, supply and fit new 15mm copper pipe with isolation valves, test all joints under pressure, make good and leave the area clean"
      : `Line item number ${i + 1}`,
    qty: i % 4 === 0 ? 1.5 : 1,
    unit_rate_cents: 1000 + i * 125,
    amount_cents: 1000 + i * 125,
    position: i,
  }));

describe("QuoteDocument PDF", () => {
  const render = (p: PublicQuote) => renderQuotePdfBuffer(buildQuoteDocument(p, { logoUrl: null, photos: [] }));

  it("renders a short quote with a deposit to a real, single-page PDF", async () => {
    const buffer = await render(pub);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(5000);
    expect(pageCount(buffer)).toBe(1);
  }, 30_000);

  it("breaks a 25-line quote across pages", async () => {
    const buffer = await render({ ...pub, items: lines(25) });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(buffer)).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("renders very long descriptions, long names and no deposit without throwing", async () => {
    const buffer = await render({
      ...pub,
      items: lines(5, true),
      quote: { ...pub.quote, deposit_enabled: false, notes: null },
      business: { ...pub.business, name: "Miller & Sons Plumbing, Heating and Drainage Specialists Ltd", plan_branding: false },
      customer: { ...pub.customer, name: "Bartholomew Wolfeschlegelsteinhausenbergerdorff-Smythe" },
    });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("renders a 60-line quote on more than one page", async () => {
    const buffer = await render({ ...pub, items: lines(60) });
    expect(pageCount(buffer)).toBeGreaterThanOrEqual(3);
  }, 30_000);
});

describe("monogramFor", () => {
  it("uses the first letters of the first two words", () => {
    expect(monogramFor("Miller Plumbing")).toBe("MP");
    expect(monogramFor("Dave")).toBe("DA");
    expect(monogramFor("  a & b Electrical ")).toBe("AB");
    expect(monogramFor("")).toBe("T");
  });
});

describe("email templates", () => {
  it("renders the customer email with the link, total and a plain-text version", async () => {
    const element = createElement(QuoteToCustomerEmail, {
      businessName: "Miller Plumbing",
      logoUrl: null,
      customerName: "Sarah Thompson",
      quoteWord: "Estimate",
      number: "1047",
      totalText: "$334.80",
      validUntilText: "Oct 28, 2026",
      link: "https://app.test/q/abcdefghijklmnopqrstuvwxyz123456",
      branding: true,
    });
    const html = (await render(element)).replace(/<!-- -->/g, "");
    const text = await render(element, { plainText: true });
    expect(html).toContain("Hi Sarah,");
    expect(html).toContain("View estimate");
    expect(html).toContain("$334.80");
    expect(html).toContain('href="https://app.test/q/abcdefghijklmnopqrstuvwxyz123456"');
    expect(html).toContain("Sent with Tradeslip");
    expect(text).toContain("$334.80");
    expect(text).not.toContain("<");
  });

  it("drops the Tradeslip footer on paid plans", async () => {
    const html = await render(
      createElement(QuoteToCustomerEmail, { businessName: "Miller Plumbing", logoUrl: null, customerName: null, quoteWord: "Quote", number: "1", totalText: "£10.00", validUntilText: null, link: "https://app.test/q/x", branding: false }),
    );
    expect(html).not.toContain("Sent with Tradeslip");
    expect(html).toContain("Hi,");
  });

  it("renders the three owner notifications", async () => {
    const base = { quoteWord: "Estimate", number: "1047", customerName: "Sarah Thompson", link: "https://app.test/quotes/1", businessName: "Miller Plumbing" };
    const flat = async (el: ReturnType<typeof createElement>) => (await render(el)).replace(/<!-- -->/g, "");
    const viewed = await flat(createElement(OwnerNotificationEmail, { kind: "viewed", ...base }));
    expect(viewed).toContain("just opened estimate #1047");
    const accepted = await flat(createElement(OwnerNotificationEmail, { kind: "accepted", ...base, acceptedName: "Sarah T", verified: true, totalText: "$334.80", depositText: "$100.44" }));
    expect(accepted).toContain("accepted estimate #1047");
    expect(accepted).toContain("$334.80");
    expect(accepted).toContain("Deposit requested: $100.44");
    const declined = await flat(createElement(OwnerNotificationEmail, { kind: "declined", ...base, reason: "Too expensive" }));
    expect(declined).toContain("Too expensive");
    expect(ownerNotificationSubject({ kind: "declined", ...base, reason: null })).toBe("Sarah Thompson declined estimate #1047");
  });

  it("renders the code email with a large code, the expiry and the ignore notice", async () => {
    const element = createElement(OtpCodeEmail, {
      businessName: "Miller Plumbing",
      logoUrl: null,
      customerName: "Sarah Thompson",
      quoteWord: "Estimate",
      number: "1047",
      code: "004217",
      expiresMinutes: 10,
    });
    const html = (await render(element)).replace(/<!-- -->/g, "");
    const text = await render(element, { plainText: true });
    expect(html).toContain("004217");
    expect(html).toContain("expires in 10 minutes");
    expect(html).toContain("If you did not request this, ignore this email");
    expect(html).toContain("Miller Plumbing");
    expect(text).toContain("004217");
    expect(text).not.toContain("<");
  });

  it("says whether an acceptance was verified in the owner email", async () => {
    const base = { kind: "accepted" as const, quoteWord: "Estimate", number: "1047", customerName: "Sarah", link: "https://app.test/quotes/1", businessName: "Miller", acceptedName: "Sarah T", totalText: "$334.80", depositText: null };
    const verified = (await render(createElement(OwnerNotificationEmail, { ...base, verified: true }))).replace(/<!-- -->/g, "");
    const unverified = (await render(createElement(OwnerNotificationEmail, { ...base, verified: false }))).replace(/<!-- -->/g, "");
    expect(verified).toContain("Verified by email");
    expect(unverified).toContain("Not verified");
  });

  it("builds a safe From header", () => {
    vi.stubEnv("EMAIL_FROM", "Tradeslip <quotes@mail.tradeslip.com>");
    expect(formatFrom('Miller "Best" Plumbing\r\nBcc: x@y.z')).toBe('"Miller Best Plumbing Bcc: x@y.z via Tradeslip" <quotes@mail.tradeslip.com>');
    vi.unstubAllEnvs();
  });
});
