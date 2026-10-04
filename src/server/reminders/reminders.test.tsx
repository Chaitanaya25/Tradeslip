// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { render } from "@react-email/components";
import { checkCronAuth } from "@/lib/cron-auth";
import { KIND_LABELS, reminderInfoText, skipReasonMessage } from "@/lib/reminder-messages";
import { verifyUnsubscribeToken } from "@/lib/reminder-token";
import type { SkipReason } from "@/lib/reminders";
import type { SendResult } from "@/server/email/send";
import {
  buildReminderMessage,
  deliverReminder,
  subjectFor,
  targetFromInvoiceRow,
  targetFromQuoteRow,
  valuesForTarget,
  type DeliverIo,
  type ReminderTarget,
} from "./deliver";
import { MAX_EMAILS_PER_RUN, runReminders, type DueInvoiceRow, type DueQuoteRow, type RunDeps } from "./run";

const SECRET = "test-secret-with-enough-length-1234567890";
const BIZ = "11111111-1111-4111-8111-111111111111";
const APP = "https://app.test";

const invoiceRow = (o: Partial<DueInvoiceRow> = {}): DueInvoiceRow => ({
  entity_id: "i-1",
  business_id: BIZ,
  number: 1001,
  number_prefix: "INV-",
  total_cents: 41000,
  amount_paid_cents: 0,
  currency: "USD",
  due_date: "2026-10-10",
  public_token: "tok_invoice_abcdefghijklmnopqrstuvwxyz",
  reminder_count: 0,
  last_reminder_at: null,
  customer_name: "Sarah Thompson",
  customer_email: "sarah@example.com",
  business_name: "Miller Plumbing",
  business_email: "dave@example.com",
  country: "US",
  timezone: "America/New_York",
  plan: "pro",
  logo_path: null,
  plan_branding: false,
  template: null,
  reminders_enabled: true,
  invoice_reminders_enabled: true,
  invoice_reminder_1_days: 1,
  invoice_reminder_2_days: 7,
  reminder_kind: "invoice_reminder_1",
  unsubscribed: false,
  ...o,
});

const quoteRow = (o: Partial<DueQuoteRow> = {}): DueQuoteRow => ({
  entity_id: "q-1",
  business_id: BIZ,
  number: 1047,
  number_prefix: "",
  total_cents: 33480,
  currency: "USD",
  valid_until: "2026-11-30",
  sent_at: "2026-10-09T14:00:00Z",
  public_token: "tok_quote_abcdefghijklmnopqrstuvwxyz1",
  followup_count: 0,
  last_followup_at: null,
  customer_name: "Tom Hughes",
  customer_email: "tom@example.com",
  business_name: "Miller Plumbing",
  business_email: "dave@example.com",
  country: "US",
  timezone: "America/New_York",
  plan: "pro",
  logo_path: null,
  plan_branding: false,
  template: null,
  reminders_enabled: true,
  quote_followup_enabled: true,
  quote_followup_days: 3,
  unsubscribed: false,
  ...o,
});

// 11:00 in New York: inside the 8am-6pm window.
const IN_WINDOW = new Date("2026-10-14T15:00:00Z");
const NIGHT = new Date("2026-10-14T03:00:00Z");

function fakeIo(send: DeliverIo["send"], over: Partial<DeliverIo> = {}) {
  const claimed = new Set<string>();
  const finalized: { id: string; status: string; reason: string | null; messageId: string | null }[] = [];
  let n = 0;
  const io: DeliverIo = {
    appUrl: APP,
    unsubscribeSecret: SECRET,
    claim: async (entity, id, kind) => {
      const key = `${entity}:${id}:${kind}`;
      if (claimed.has(key)) return null;
      claimed.add(key);
      return `claim-${++n}`;
    },
    finalize: async (id, status, reason, messageId) => {
      finalized.push({ id, status, reason, messageId });
      return true;
    },
    send,
    ...over,
  };
  return { io, claimed, finalized };
}

const okSend = (): DeliverIo["send"] => vi.fn(async () => ({ ok: true, id: "re_123" }) as SendResult);

describe("buildReminderMessage / templates", () => {
  const target: ReminderTarget = targetFromInvoiceRow({ ...invoiceRow(), reminder_kind: "invoice_reminder_1" });
  const clean = (html: string) => html.replace(/<!-- -->/g, "");

  it("renders the invoice reminder with body, button link, unsubscribe link and a plain-text version", async () => {
    const m = buildReminderMessage(target, { appUrl: APP, unsubscribeSecret: SECRET });
    const html = clean(await render(m.react));
    const text = await render(m.react, { plainText: true });
    expect(html).toContain("Hi Sarah,");
    expect(html).toContain("invoice #INV-1001 for $410.00 was due on Oct 10, 2026");
    expect(html).toContain("View invoice");
    expect(html).toContain(`href="${APP}/i/tok_invoice_abcdefghijklmnopqrstuvwxyz"`);
    expect(html).toContain("You received this because Miller Plumbing sent you an invoice.");
    expect(html).toContain("Stop these reminders");
    expect(html).toContain(m.unsubscribeUrl);
    expect(text).toContain(m.unsubscribeUrl);
    expect(text).toContain("Hi Sarah,");
    expect(text).not.toContain("<");
    expect(m.headers["List-Unsubscribe"]).toBe(`<${m.unsubscribeUrl}>`);
    expect(m.subject).toBe("Reminder: invoice #INV-1001 from Miller Plumbing");
    expect(m.to).toBe("sarah@example.com");
    expect(m.replyTo).toBe("dave@example.com");
  });
  it("signs an unsubscribe link for exactly this business and address", () => {
    const m = buildReminderMessage(target, { appUrl: APP, unsubscribeSecret: SECRET });
    const token = m.unsubscribeUrl.split("/unsubscribe/")[1];
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({ businessId: BIZ, email: "sarah@example.com" });
  });
  it("shows the balance for a part-paid invoice, and uses the firmer second message", async () => {
    const part = targetFromInvoiceRow({ ...invoiceRow({ amount_paid_cents: 10000 }), reminder_kind: "invoice_reminder_2" });
    const m = buildReminderMessage(part, { appUrl: APP, unsubscribeSecret: SECRET });
    const html = clean(await render(m.react));
    expect(html).toContain("Balance still due");
    expect(html).toContain("$310.00");
    expect(html).toContain("still outstanding");
    expect(m.subject).toBe("Following up: invoice #INV-1001 from Miller Plumbing");
  });
  it("quote follow-up uses the region's word and links to the public quote page", async () => {
    const us = buildReminderMessage(targetFromQuoteRow(quoteRow()), { appUrl: APP, unsubscribeSecret: SECRET });
    const usHtml = clean(await render(us.react));
    expect(usHtml).toContain("View estimate");
    expect(usHtml).toContain("the estimate #1047 for $334.80");
    expect(usHtml).toContain(`href="${APP}/q/tok_quote_abcdefghijklmnopqrstuvwxyz1"`);
    const uk = buildReminderMessage(targetFromQuoteRow(quoteRow({ country: "UK", currency: "GBP" })), { appUrl: APP, unsubscribeSecret: SECRET });
    const ukHtml = clean(await render(uk.react));
    expect(ukHtml).toContain("View quote");
    expect(ukHtml).toContain("£334.80");
    expect(ukHtml).toContain("Many thanks,");
    expect(ukHtml).toContain("sent you a quote.");
  });
  it("uses the saved template when there is one, and never renders raw HTML", async () => {
    const t = targetFromQuoteRow(quoteRow({ template: "Hello {customer_name} <script>alert(1)</script>\n\nSee {link} {nope}", customer_name: "<img src=x onerror=alert(1)> Evil" }));
    const m = buildReminderMessage(t, { appUrl: APP, unsubscribeSecret: SECRET });
    const html = clean(await render(m.react));
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("{nope}");
    expect(html).toContain("alert(1)");
  });
  it("greets 'there' with no customer name and doesn't leak the payment link", async () => {
    const t = targetFromInvoiceRow({ ...invoiceRow({ customer_name: null }), reminder_kind: "invoice_reminder_1" });
    const html = clean(await render(buildReminderMessage(t, { appUrl: APP, unsubscribeSecret: SECRET }).react));
    expect(html).toContain("Hi there,");
    expect(html).not.toContain("pay.example.com");
  });
  it("values and subjects", () => {
    const v = valuesForTarget(target, APP);
    expect(v).toMatchObject({ customer_name: "Sarah", document_word: "invoice", number: "INV-1001", total: "$410.00", balance_due: "$410.00" });
    expect(subjectFor(targetFromQuoteRow(quoteRow({ country: "UK" })))).toBe("Following up: quote #1047 from Miller Plumbing");
  });
});

describe("deliverReminder", () => {
  const target = targetFromInvoiceRow({ ...invoiceRow(), reminder_kind: "invoice_reminder_1" });

  it("claims, sends to the customer on file and finalizes as sent with the message id", async () => {
    const send = okSend();
    const { io, finalized } = fakeIo(send);
    expect(await deliverReminder(target, io)).toEqual({ outcome: "sent", messageId: "re_123" });
    expect(send).toHaveBeenCalledTimes(1);
    expect((send as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ to: "sarah@example.com", replyTo: "dave@example.com", businessName: "Miller Plumbing" });
    expect(finalized).toEqual([{ id: "claim-1", status: "sent", reason: null, messageId: "re_123" }]);
  });
  it("sends nothing when the claim is not granted (another run has it)", async () => {
    const send = okSend();
    const { io } = fakeIo(send, { claim: async () => null });
    expect(await deliverReminder(target, io)).toEqual({ outcome: "claim_lost" });
    expect(send).not.toHaveBeenCalled();
  });
  it("two deliveries of the same reminder send exactly one email", async () => {
    const send = okSend();
    const { io } = fakeIo(send);
    const results = await Promise.all([deliverReminder(target, io), deliverReminder(target, io)]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["claim_lost", "sent"]);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each(["unverified_domain", "rate_limited", "failed", "not_configured"] as const)("records %s as failed, never as sent", async (reason) => {
    const { io, finalized } = fakeIo(async () => ({ ok: false, reason }));
    expect(await deliverReminder(target, io)).toEqual({ outcome: "failed", reason });
    expect(finalized[0]).toMatchObject({ status: "failed", reason, messageId: null });
  });
  it("skips an invalid address permanently", async () => {
    const { io, finalized } = fakeIo(async () => ({ ok: false, reason: "invalid_address" }));
    expect(await deliverReminder(target, io)).toEqual({ outcome: "skipped", reason: "invalid_address" });
    expect(finalized[0]).toMatchObject({ status: "skipped", reason: "invalid_address" });
  });
  it("a send that throws is a failure, not a crash", async () => {
    const { io, finalized } = fakeIo(async () => {
      throw new Error("boom");
    });
    expect(await deliverReminder(target, io)).toEqual({ outcome: "failed", reason: "failed" });
    expect(finalized[0].status).toBe("failed");
  });
  it("refuses without a signing secret or recipient, before claiming anything", async () => {
    const claim = vi.fn(async () => "c");
    expect(await deliverReminder(target, fakeIo(okSend(), { unsubscribeSecret: null, claim }).io)).toEqual({ outcome: "failed", reason: "unsubscribe_secret_missing" });
    expect(await deliverReminder({ ...target, customerEmail: "" }, fakeIo(okSend(), { claim }).io)).toEqual({ outcome: "failed", reason: "no_recipient" });
    expect(claim).not.toHaveBeenCalled();
  });
});

describe("runReminders", () => {
  function deps(options: Omit<Partial<RunDeps>, "now"> & { invoices?: DueInvoiceRow[]; quotes?: DueQuoteRow[]; now?: Date; send?: DeliverIo["send"] } = {}) {
    const { invoices, quotes, now, send: sendOverride, ...over } = options;
    const send = sendOverride ?? okSend();
    const { io, finalized } = fakeIo(send);
    const sleep = vi.fn(async () => undefined);
    const d: RunDeps = {
      now: () => now ?? IN_WINDOW,
      sleep,
      expire: async () => 2,
      listInvoices: async () => invoices ?? [],
      listQuotes: async () => quotes ?? [],
      deliver: (target) => deliverReminder(target, io),
      ...over,
    };
    return { d, send, sleep, finalized };
  }

  it("sends due reminders and returns counts only", async () => {
    const { d, send } = deps({ invoices: [invoiceRow()], quotes: [quoteRow()] });
    const summary = await runReminders(d);
    expect(summary).toEqual({ scanned: 2, sent: 2, skipped: 0, failed: 0, expired: 2 });
    expect(Object.keys(summary).sort()).toEqual(["expired", "failed", "scanned", "sent", "skipped"]);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("sends nothing outside 8am-6pm local time", async () => {
    const { d, send } = deps({ invoices: [invoiceRow()], quotes: [quoteRow()], now: NIGHT });
    expect(await runReminders(d)).toMatchObject({ scanned: 2, sent: 0, skipped: 2 });
    expect(send).not.toHaveBeenCalled();
  });
  it("re-checks what the database returned: free plan, unsubscribed, no email, wrong day", async () => {
    const { d, send } = deps({
      invoices: [invoiceRow({ plan: "free" }), invoiceRow({ entity_id: "i-2", unsubscribed: true }), invoiceRow({ entity_id: "i-3", customer_email: null }), invoiceRow({ entity_id: "i-4", due_date: "2026-10-14" })],
      quotes: [quoteRow({ followup_count: 1 })],
    });
    expect(await runReminders(d)).toMatchObject({ scanned: 5, sent: 0, skipped: 5 });
    expect(send).not.toHaveBeenCalled();
  });
  it("running twice sends once (the claim is exclusive)", async () => {
    const send = okSend();
    const { io } = fakeIo(send);
    const base = { now: () => IN_WINDOW, sleep: async () => undefined, expire: async () => 0, listInvoices: async () => [invoiceRow()], listQuotes: async () => [], deliver: (t: ReminderTarget) => deliverReminder(t, io) };
    const first = await runReminders(base);
    const second = await runReminders(base);
    expect(first.sent).toBe(1);
    expect(second).toMatchObject({ sent: 0, skipped: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it(`never sends more than ${MAX_EMAILS_PER_RUN} in one run`, async () => {
    const many = Array.from({ length: 120 }, (_, i) => invoiceRow({ entity_id: `i-${i}` }));
    const { d, send } = deps({ invoices: many });
    const summary = await runReminders({ ...d, delayMs: 0 });
    expect(send).toHaveBeenCalledTimes(MAX_EMAILS_PER_RUN);
    expect(summary).toMatchObject({ scanned: 120, sent: MAX_EMAILS_PER_RUN, skipped: 30 });
  });
  it("pauses between sends but not before the first", async () => {
    const { d, sleep } = deps({ invoices: [invoiceRow(), invoiceRow({ entity_id: "i-2" }), invoiceRow({ entity_id: "i-3" })] });
    await runReminders(d);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("stops early when the provider rate limits, leaving the rest for the next run", async () => {
    let calls = 0;
    const send: DeliverIo["send"] = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? ({ ok: true, id: "re_1" } as SendResult) : ({ ok: false, reason: "rate_limited" } as SendResult);
    });
    const { d } = deps({ send, invoices: [invoiceRow(), invoiceRow({ entity_id: "i-2" }), invoiceRow({ entity_id: "i-3" }), invoiceRow({ entity_id: "i-4" })] });
    const summary = await runReminders({ ...d, delayMs: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ sent: 1, failed: 1, skipped: 2 });
  });
  it("counts an invalid address as skipped and keeps going; other failures do not stop the run", async () => {
    const sends: SendResult[] = [{ ok: false, reason: "invalid_address" }, { ok: false, reason: "failed" }, { ok: true, id: "re_3" }];
    const send: DeliverIo["send"] = vi.fn(async () => sends.shift() as SendResult);
    const { d } = deps({ send, invoices: [invoiceRow(), invoiceRow({ entity_id: "i-2" }), invoiceRow({ entity_id: "i-3" })] });
    expect(await runReminders({ ...d, delayMs: 0 })).toMatchObject({ sent: 1, failed: 1, skipped: 1 });
  });
  it("never retries the same item inside one run", async () => {
    const send: DeliverIo["send"] = vi.fn(async () => ({ ok: false, reason: "failed" }) as SendResult);
    const { d } = deps({ send, invoices: [invoiceRow()] });
    await runReminders({ ...d, delayMs: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("survives a failing expire step or list step", async () => {
    const { d } = deps({ expire: async () => { throw new Error("x"); }, listInvoices: async () => { throw new Error("y"); } });
    expect(await runReminders(d)).toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0, expired: 0 });
  });
  it("logs counts and codes only, never addresses or bodies", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { d } = deps({ invoices: [invoiceRow()] });
    await runReminders(d);
    const logged = JSON.stringify(spy.mock.calls);
    spy.mockRestore();
    expect(logged).not.toContain("sarah@example.com");
    expect(logged).not.toContain("Sarah");
    expect(logged).toContain("sent");
  });
});

describe("checkCronAuth", () => {
  const secret = "a-long-enough-cron-secret-1234567890";
  it("accepts exactly the right bearer token", () => {
    expect(checkCronAuth(`Bearer ${secret}`, secret)).toBe("ok");
  });
  it("rejects missing, wrong, malformed and near-miss tokens", () => {
    for (const header of [null, "", "Bearer", "Bearer ", `Bearer ${secret}x`, `Bearer ${secret.slice(0, -1)}`, `bearer ${secret}`, `Basic ${secret}`, secret, "Bearer wrong"]) {
      expect(checkCronAuth(header, secret)).toBe("unauthorized");
    }
  });
  it("refuses when no (or a too short) secret is configured, even with a matching header", () => {
    expect(checkCronAuth("Bearer anything", undefined)).toBe("misconfigured");
    expect(checkCronAuth("Bearer ", "")).toBe("misconfigured");
    expect(checkCronAuth("Bearer short", "short")).toBe("misconfigured");
  });
});

describe("messages", () => {
  const reasons: SkipReason[] = ["plan", "disabled", "status", "expired", "already_sent", "no_email", "unsubscribed", "too_soon", "recent", "window", "not_overdue", "max_reached"];
  it("every refusal has plain wording", () => {
    for (const r of reasons) {
      expect(skipReasonMessage(r, "invoice", "Estimate").length).toBeGreaterThan(10);
      expect(skipReasonMessage(r, "quote", "Estimate").length).toBeGreaterThan(10);
    }
    expect(skipReasonMessage("already_sent", "quote", "Estimate")).toBe("A follow-up has already been sent for this estimate.");
    expect(skipReasonMessage("max_reached", "invoice", "Quote")).toBe("Both reminders have already been sent for this invoice.");
  });
  it("detail page line", () => {
    expect(reminderInfoText({ state: "sent", date: "2026-10-13" }, "quote", "en-US")).toBe("Follow-up sent on Oct 13, 2026");
    expect(reminderInfoText({ state: "next", date: "2026-10-13" }, "invoice", "en-GB")).toBe("Next reminder: 13 Oct 2026");
    expect(reminderInfoText({ state: "off", reason: "disabled" }, "invoice", "en-US")).toBe("Reminders are off");
    expect(reminderInfoText({ state: "off", reason: "plan" }, "invoice", "en-US")).toContain("paid plans");
    expect(reminderInfoText({ state: "none" }, "invoice", "en-US")).toBeNull();
    expect(KIND_LABELS.invoice_reminder_2).toBe("Second reminder");
  });
});
