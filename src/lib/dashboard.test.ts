import { describe, expect, it } from "vitest";
import {
  MAX_ATTENTION_ITEMS,
  buildNeedsAttention,
  compareLabel,
  daysBetween,
  firstNameOf,
  formatDashboardDate,
  greetingFor,
  localDateOf,
  percentChange,
  type AttentionInvoice,
  type AttentionQuote,
} from "./dashboard";

describe("greetingFor", () => {
  const at = (iso: string, tz: string) => greetingFor(new Date(iso), tz);
  it("switches at noon and 5pm local time", () => {
    expect(at("2026-10-14T00:00:00Z", "UTC")).toBe("Morning");
    expect(at("2026-10-14T11:59:00Z", "UTC")).toBe("Morning");
    expect(at("2026-10-14T12:00:00Z", "UTC")).toBe("Afternoon");
    expect(at("2026-10-14T16:59:00Z", "UTC")).toBe("Afternoon");
    expect(at("2026-10-14T17:00:00Z", "UTC")).toBe("Evening");
    expect(at("2026-10-14T23:59:00Z", "UTC")).toBe("Evening");
  });
  it("uses the business timezone, not the server's", () => {
    // 03:00 UTC is 20:00 the evening before in Los Angeles (PDT) and 14:00 in Auckland... (NZDT is UTC+13 -> 16:00).
    expect(at("2026-10-14T03:00:00Z", "America/Los_Angeles")).toBe("Evening");
    expect(at("2026-10-14T03:00:00Z", "Pacific/Auckland")).toBe("Afternoon");
    expect(at("2026-10-14T03:00:00Z", "Europe/London")).toBe("Morning");
  });
  it("treats midnight as morning (h23, not 24)", () => {
    expect(at("2026-10-14T00:30:00Z", "Europe/London")).toBe("Morning");
  });
});

describe("formatDashboardDate", () => {
  const now = new Date("2026-10-14T15:00:00Z");
  it("follows the region's date order", () => {
    expect(formatDashboardDate(now, "Europe/London", "en-GB")).toBe("Wednesday 14 October");
    expect(formatDashboardDate(now, "America/New_York", "en-US")).toBe("Wednesday, October 14");
  });
  it("uses the business-local day", () => {
    expect(formatDashboardDate(new Date("2026-10-14T23:30:00Z"), "Australia/Sydney", "en-AU")).toContain("15 October");
  });
});

describe("helpers", () => {
  it("first name", () => {
    expect(firstNameOf("Dave Miller")).toBe("Dave");
    expect(firstNameOf("  Dave ")).toBe("Dave");
    expect(firstNameOf("")).toBe("");
  });
  it("local date and days between", () => {
    expect(localDateOf("2026-10-14T23:30:00Z", "Australia/Sydney")).toBe("2026-10-15");
    expect(daysBetween("2026-10-01", "2026-10-04")).toBe(3);
    expect(daysBetween("2026-10-04", "2026-10-01")).toBe(-3);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });
});

describe("percentChange and compareLabel", () => {
  it("is null when last month is zero (never divides by zero)", () => {
    expect(percentChange(5000, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(5000, -1)).toBeNull();
  });
  it("rounds to whole percent, up and down", () => {
    expect(percentChange(12340, 10456)).toBe(18);
    expect(percentChange(5000, 10000)).toBe(-50);
    expect(percentChange(10000, 10000)).toBe(0);
    expect(percentChange(0, 10000)).toBe(-100);
  });
  it("words it", () => {
    expect(compareLabel(18)).toBe("up 18% vs last month");
    expect(compareLabel(-5)).toBe("down 5% vs last month");
    expect(compareLabel(0)).toBe("same as last month");
    expect(compareLabel(null)).toBeNull();
  });
});

describe("buildNeedsAttention", () => {
  const today = "2026-10-14";
  const customer = (name: string) => ({ name, email: `${name}@x.co`, phone: null });
  const money = (c: number) => `$${(c / 100).toFixed(0)}`;
  const base = { today, timeZone: "UTC", quoteWord: "Estimate", money, quoteLabel: (n: number) => `QU-${n}`, invoiceLabel: (n: number) => `INV-${n}` };

  const inv = (o: Partial<AttentionInvoice> & { id: string; number: number }): AttentionInvoice => ({
    status: "sent",
    dueDate: "2026-10-10",
    totalCents: 41000,
    amountPaidCents: 0,
    customer: customer("Priya Patel"),
    link: "https://app.test/i/abc",
    ...o,
  });
  const quote = (o: Partial<AttentionQuote> & { id: string; number: number }): AttentionQuote => ({
    status: "sent",
    validUntil: "2026-11-30",
    sentAt: "2026-10-14T09:00:00Z",
    totalCents: 32000,
    customer: customer("Tom Hughes"),
    link: "https://app.test/q/abc",
    ...o,
  });
  const build = (invoices: AttentionInvoice[], quotes: AttentionQuote[], withInvoice: string[] = []) =>
    buildNeedsAttention({ ...base, invoices, quotes, quotesWithInvoice: new Set(withInvoice) });

  it("lists overdue invoices oldest first with the days overdue in the title", () => {
    const items = build([inv({ id: "a", number: 1, dueDate: "2026-10-09" }), inv({ id: "b", number: 2, dueDate: "2026-10-01", customer: customer("Mark Evans") })], []);
    expect(items.map((i) => i.key)).toEqual(["invoice:b", "invoice:a"]);
    expect(items[1].title).toBe("Priya Patel's invoice is 5 days overdue");
    expect(items[0].title).toBe("Mark Evans's invoice is 13 days overdue");
    expect(items[1]).toMatchObject({ type: "overdue_invoice", tone: "bad", actionLabel: "Send reminder", meta: "$410 • Invoice #INV-1", href: "/invoices/a" });
    expect(items[1].share?.kind).toBe("invoice");
  });
  it("says 1 day for a single day and shows the balance for part-paid invoices", () => {
    const [item] = build([inv({ id: "a", number: 7, dueDate: "2026-10-13", amountPaidCents: 11000 })], []);
    expect(item.title).toContain("1 day overdue");
    expect(item.meta).toBe("$300 • Invoice #INV-7");
  });
  it("skips invoices that are not overdue, paid, draft, void or fully covered", () => {
    const items = build(
      [
        inv({ id: "future", number: 1, dueDate: "2026-10-14" }),
        inv({ id: "paid", number: 2, status: "paid", amountPaidCents: 41000 }),
        inv({ id: "draft", number: 3, status: "draft" }),
        inv({ id: "void", number: 4, status: "void" }),
        inv({ id: "covered", number: 5, amountPaidCents: 41000 }),
      ],
      [],
    );
    expect(items).toEqual([]);
  });
  it("flags quotes expiring today or tomorrow, soonest first, but not later or already expired ones", () => {
    const items = build(
      [],
      [
        quote({ id: "t", number: 1, validUntil: "2026-10-15" }),
        quote({ id: "n", number: 2, validUntil: "2026-10-14" }),
        quote({ id: "later", number: 3, validUntil: "2026-10-16" }),
        quote({ id: "gone", number: 4, validUntil: "2026-10-13" }),
      ],
    );
    expect(items.map((i) => i.key)).toEqual(["quote-expiring:n", "quote-expiring:t"]);
    expect(items[0].title).toBe("Estimate for Tom Hughes expires today");
    expect(items[1].title).toBe("Estimate for Tom Hughes expires tomorrow");
    expect(items[1]).toMatchObject({ actionLabel: "View quote", meta: "$320 • Estimate #QU-1", tone: "neutral" });
  });
  it("expiry works at a month end", () => {
    const items = buildNeedsAttention({ ...base, today: "2026-10-31", invoices: [], quotes: [quote({ id: "m", number: 1, validUntil: "2026-11-01" })], quotesWithInvoice: new Set() });
    expect(items[0].title).toContain("expires tomorrow");
  });
  it("flags sent or viewed quotes with no reply after 3 days, oldest first", () => {
    const items = build(
      [],
      [
        quote({ id: "d3", number: 1, sentAt: "2026-10-11T08:00:00Z" }),
        quote({ id: "d2", number: 2, sentAt: "2026-10-12T08:00:00Z" }),
        quote({ id: "d9", number: 3, sentAt: "2026-10-05T08:00:00Z", status: "viewed" }),
      ],
    );
    expect(items.map((i) => i.key)).toEqual(["quote-noreply:d9", "quote-noreply:d3"]);
    expect(items[1].title).toBe("Tom Hughes hasn't replied");
    expect(items[1].meta).toBe("Sent 3 days ago • $320");
    expect(items[1].actionLabel).toBe("Send follow up");
    expect(items[1].share).toMatchObject({ kind: "quote", docLabel: "Estimate" });
  });
  it("counts days in the business timezone", () => {
    // 2026-10-11T23:30Z is already 12 Oct in Sydney (UTC+11): only 2 days before the 14th.
    const items = buildNeedsAttention({ ...base, timeZone: "Australia/Sydney", invoices: [], quotes: [quote({ id: "s", number: 1, sentAt: "2026-10-11T23:30:00Z" })], quotesWithInvoice: new Set() });
    expect(items).toEqual([]);
  });
  it("lists a quote once, as expiring, even if it is also unanswered", () => {
    const items = build([], [quote({ id: "q", number: 1, validUntil: "2026-10-15", sentAt: "2026-10-01T00:00:00Z" })]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("expiring_quote");
  });
  it("offers Create invoice for accepted quotes with none", () => {
    const items = build([], [quote({ id: "a", number: 4, status: "accepted" }), quote({ id: "b", number: 5, status: "accepted" })], ["b"]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "create_invoice", actionLabel: "Create invoice", quoteId: "a", title: "Tom Hughes accepted estimate #QU-4" });
  });
  it("orders overdue, expiring, no reply, create invoice, and caps at 5", () => {
    const items = build(
      [inv({ id: "i1", number: 1 }), inv({ id: "i2", number: 2, dueDate: "2026-10-02" })],
      [
        quote({ id: "e", number: 3, validUntil: "2026-10-15" }),
        quote({ id: "r", number: 4, sentAt: "2026-10-01T00:00:00Z" }),
        quote({ id: "a", number: 5, status: "accepted" }),
        quote({ id: "r2", number: 6, sentAt: "2026-10-02T00:00:00Z" }),
      ],
    );
    expect(items).toHaveLength(MAX_ATTENTION_ITEMS);
    expect(items.map((i) => i.type)).toEqual(["overdue_invoice", "overdue_invoice", "expiring_quote", "no_reply", "no_reply"]);
    expect(items[0].key).toBe("invoice:i2");
  });
  it("is empty when nothing needs attention", () => {
    expect(build([], [])).toEqual([]);
  });
  it("drops the Send sheet payload when there is no public link", () => {
    const [item] = build([inv({ id: "a", number: 1, link: null })], []);
    expect(item.share).toBeNull();
  });
});
