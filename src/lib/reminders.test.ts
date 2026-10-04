import { describe, expect, it } from "vitest";
import fixtures from "./reminders.fixtures.json";
import {
  DEFAULT_REMINDER_SETTINGS,
  MAX_TEMPLATE_LENGTH,
  SAMPLE_VALUES,
  TEMPLATE_TOKENS,
  bodyParagraphs,
  defaultTemplates,
  firstNameForGreeting,
  invoiceReminderDue,
  invoiceReminderInfo,
  isWithinSendWindow,
  planAllowsReminders,
  quoteFollowupDue,
  quoteReminderInfo,
  replaceTokens,
  settingsFromBusiness,
  templateOrDefault,
  type InvoiceForReminder,
  type QuoteForFollowup,
  type ReminderSettings,
} from "./reminders";
import { reminderSettingsSchema } from "./schemas/reminders";

describe("planAllowsReminders", () => {
  it("allows trial, pro and business; not free or unknown", () => {
    expect(planAllowsReminders("trial")).toBe(true);
    expect(planAllowsReminders("pro")).toBe(true);
    expect(planAllowsReminders("business")).toBe(true);
    expect(planAllowsReminders("free")).toBe(false);
    expect(planAllowsReminders("enterprise")).toBe(false);
    expect(planAllowsReminders("")).toBe(false);
  });
});

describe("isWithinSendWindow", () => {
  const at = (iso: string, tz: string) => isWithinSendWindow(new Date(iso), tz);
  it("is true from 08:00:00 to 17:59:59 local time", () => {
    expect(at("2026-10-14T11:59:59Z", "America/New_York")).toBe(false); // 07:59:59 EDT
    expect(at("2026-10-14T12:00:00Z", "America/New_York")).toBe(true); // 08:00:00
    expect(at("2026-10-14T21:59:59Z", "America/New_York")).toBe(true); // 17:59:59
    expect(at("2026-10-14T22:00:00Z", "America/New_York")).toBe(false); // 18:00:00
  });
  it("uses the business timezone, not UTC", () => {
    expect(at("2026-10-14T13:00:00Z", "Europe/London")).toBe(true); // 14:00 BST
    expect(at("2026-10-14T13:00:00Z", "Australia/Sydney")).toBe(false); // 00:00 next day
    expect(at("2026-10-14T23:00:00Z", "Australia/Sydney")).toBe(true); // 10:00 AEDT
  });
  it("is correct across DST changes", () => {
    // New York springs forward on 2026-03-08: 08:00 EDT = 12:00Z (not 13:00Z).
    expect(at("2026-03-08T11:59:00Z", "America/New_York")).toBe(false);
    expect(at("2026-03-08T12:00:00Z", "America/New_York")).toBe(true);
    // London goes back on 2026-10-25: 08:00 GMT = 08:00Z.
    expect(at("2026-10-25T07:59:00Z", "Europe/London")).toBe(false);
    expect(at("2026-10-25T08:00:00Z", "Europe/London")).toBe(true);
    expect(at("2026-10-25T17:59:00Z", "Europe/London")).toBe(true);
    expect(at("2026-10-25T18:00:00Z", "Europe/London")).toBe(false);
  });
  it("accepts custom hours and never treats midnight as inside", () => {
    expect(isWithinSendWindow(new Date("2026-10-14T00:30:00Z"), "UTC")).toBe(false);
    expect(isWithinSendWindow(new Date("2026-10-14T09:00:00Z"), "UTC", 9, 10)).toBe(true);
    expect(isWithinSendWindow(new Date("2026-10-14T10:00:00Z"), "UTC", 9, 10)).toBe(false);
  });
});

// --- The shared fixture table: the SQL list functions are checked against the same cases. ---
type Fx = (typeof fixtures.cases)[number] & { business?: Record<string, unknown>; customerEmail?: string | null; unsubscribed?: boolean; tz?: string; now?: string };

function settingsFor(business: Record<string, unknown>): ReminderSettings {
  return settingsFromBusiness(business as never);
}

describe("fixtures (shared with the SQL smoke test)", () => {
  it.each(fixtures.cases as Fx[])("$name", (fx) => {
    const biz = { ...fixtures.defaults.business, ...(fx.business ?? {}) };
    const tz = fx.tz ?? fixtures.defaults.tz;
    const now = new Date(fx.now ?? fixtures.defaults.now);
    const email = "customerEmail" in fx ? (fx.customerEmail ?? null) : fixtures.defaults.customerEmail;
    const ctx = { plan: biz.plan as string, unsubscribed: fx.unsubscribed ?? fixtures.defaults.unsubscribed };
    const settings = settingsFor(biz);

    if (fx.kind === "quote") {
      const q = (fx as never as { quote: Record<string, unknown> }).quote;
      const r = quoteFollowupDue(
        { status: q.status as never, validUntil: q.valid_until as string | null, sentAt: q.sent_at as string | null, followupCount: q.followup_count as number, lastFollowupAt: q.last_followup_at as string | null, customerEmail: email },
        now,
        tz,
        settings,
        ctx,
      );
      expect(r.due).toBe(fx.due);
    } else {
      const i = (fx as never as { invoice: Record<string, unknown> }).invoice;
      const r = invoiceReminderDue(
        { status: i.status as never, dueDate: i.due_date as string, totalCents: i.total_cents as number, amountPaidCents: i.amount_paid_cents as number, reminderCount: i.reminder_count as number, lastReminderAt: i.last_reminder_at as string | null, customerEmail: email },
        now,
        tz,
        settings,
        ctx,
      );
      expect(r.due).toBe(fx.due);
      if (r.due) expect(r.kind).toBe((fx as { reminder?: string }).reminder);
    }
  });
});

describe("rules in detail", () => {
  const tz = "America/New_York";
  const now = new Date("2026-10-14T15:00:00Z"); // 11:00 local, inside the window
  const ctx = { plan: "pro", unsubscribed: false };
  const settings = DEFAULT_REMINDER_SETTINGS;
  const quote: QuoteForFollowup = { status: "sent", validUntil: "2026-11-30", sentAt: "2026-10-10T14:00:00Z", followupCount: 0, lastFollowupAt: null, customerEmail: "a@b.co" };
  const invoice: InvoiceForReminder = { status: "sent", dueDate: "2026-10-10", totalCents: 10000, amountPaidCents: 0, reminderCount: 0, lastReminderAt: null, customerEmail: "a@b.co" };

  it("outside the window nothing is due, with the reason", () => {
    const night = new Date("2026-10-14T03:00:00Z");
    expect(quoteFollowupDue(quote, night, tz, settings, ctx)).toEqual({ due: false, reason: "window" });
    expect(invoiceReminderDue(invoice, night, tz, settings, ctx)).toEqual({ due: false, reason: "window" });
  });
  it("timezone midnight: the local calendar day decides, not the UTC one", () => {
    // 2026-10-14T02:00Z is still 13 Oct 22:00 in New York: an invoice due on the 13th is not overdue yet.
    const justAfterUtcMidnight = new Date("2026-10-14T02:00:00Z");
    expect(invoiceReminderDue({ ...invoice, dueDate: "2026-10-13" }, justAfterUtcMidnight, tz, settings, ctx)).toEqual({ due: false, reason: "not_overdue" });
    // Sydney is already on the 14th (13:00 local, inside the window), so the same instant is due there.
    expect(invoiceReminderDue({ ...invoice, dueDate: "2026-10-13" }, justAfterUtcMidnight, "Australia/Sydney", settings, ctx)).toEqual({ due: true, kind: "invoice_reminder_1" });
  });
  it("double-send prevention: counters and the 24-hour rule", () => {
    expect(quoteFollowupDue({ ...quote, followupCount: 1 }, now, tz, settings, ctx)).toEqual({ due: false, reason: "already_sent" });
    expect(invoiceReminderDue({ ...invoice, reminderCount: 2 }, now, tz, settings, ctx)).toEqual({ due: false, reason: "max_reached" });
    expect(invoiceReminderDue({ ...invoice, reminderCount: 1, dueDate: "2026-09-01", lastReminderAt: "2026-10-14T10:00:00Z" }, now, tz, settings, ctx)).toEqual({ due: false, reason: "recent" });
  });
  it("reports why: plan, disabled, status, email, unsubscribed", () => {
    expect(quoteFollowupDue(quote, now, tz, settings, { ...ctx, plan: "free" })).toEqual({ due: false, reason: "plan" });
    expect(quoteFollowupDue(quote, now, tz, { ...settings, enabled: false }, ctx)).toEqual({ due: false, reason: "disabled" });
    expect(quoteFollowupDue({ ...quote, status: "accepted" }, now, tz, settings, ctx)).toEqual({ due: false, reason: "status" });
    expect(quoteFollowupDue({ ...quote, customerEmail: null }, now, tz, settings, ctx)).toEqual({ due: false, reason: "no_email" });
    expect(quoteFollowupDue(quote, now, tz, settings, { ...ctx, unsubscribed: true })).toEqual({ due: false, reason: "unsubscribed" });
    expect(invoiceReminderDue({ ...invoice, status: "paid" }, now, tz, settings, ctx)).toEqual({ due: false, reason: "status" });
  });
  it("a manual send skips the window, the waiting days and the switches, but not plan, unsubscribe, count, 24h or email", () => {
    const night = new Date("2026-10-14T03:00:00Z");
    const manual = { ...ctx, manual: true };
    expect(quoteFollowupDue({ ...quote, sentAt: "2026-10-13T14:00:00Z" }, night, tz, { ...settings, enabled: false }, manual)).toEqual({ due: true, kind: "quote_followup" });
    expect(invoiceReminderDue({ ...invoice, dueDate: "2026-10-13" }, new Date("2026-10-14T16:00:00Z"), tz, settings, manual)).toEqual({ due: true, kind: "invoice_reminder_1" });
    expect(invoiceReminderDue({ ...invoice, reminderCount: 1 }, now, tz, settings, manual)).toEqual({ due: true, kind: "invoice_reminder_2" });
    expect(invoiceReminderDue({ ...invoice, reminderCount: 2 }, now, tz, settings, manual)).toEqual({ due: false, reason: "max_reached" });
    expect(quoteFollowupDue(quote, now, tz, settings, { ...manual, plan: "free" })).toEqual({ due: false, reason: "plan" });
    expect(quoteFollowupDue(quote, now, tz, settings, { ...manual, unsubscribed: true })).toEqual({ due: false, reason: "unsubscribed" });
    expect(invoiceReminderDue({ ...invoice, dueDate: "2026-10-14" }, now, tz, settings, manual)).toEqual({ due: false, reason: "not_overdue" });
  });
});

describe("reminder info for detail pages", () => {
  const tz = "America/New_York";
  const settings = DEFAULT_REMINDER_SETTINGS;
  const quote: QuoteForFollowup = { status: "sent", validUntil: null, sentAt: "2026-10-10T14:00:00Z", followupCount: 0, lastFollowupAt: null, customerEmail: "a@b.co" };
  it("quotes", () => {
    expect(quoteReminderInfo(quote, tz, settings, "pro")).toEqual({ state: "next", date: "2026-10-13" });
    expect(quoteReminderInfo({ ...quote, followupCount: 1, lastFollowupAt: "2026-10-13T15:00:00Z" }, tz, settings, "pro")).toEqual({ state: "sent", date: "2026-10-13" });
    expect(quoteReminderInfo(quote, tz, settings, "free")).toEqual({ state: "off", reason: "plan" });
    expect(quoteReminderInfo(quote, tz, { ...settings, enabled: false }, "pro")).toEqual({ state: "off", reason: "disabled" });
    expect(quoteReminderInfo({ ...quote, status: "accepted" }, tz, settings, "pro")).toEqual({ state: "none" });
  });
  it("invoices", () => {
    const inv: InvoiceForReminder = { status: "sent", dueDate: "2026-10-10", totalCents: 100, amountPaidCents: 0, reminderCount: 0, lastReminderAt: null, customerEmail: "a@b.co" };
    expect(invoiceReminderInfo(inv, tz, settings, "pro")).toEqual({ state: "next", date: "2026-10-11" });
    expect(invoiceReminderInfo({ ...inv, reminderCount: 1, lastReminderAt: "2026-10-11T15:00:00Z" }, tz, settings, "pro")).toEqual({ state: "next", date: "2026-10-17" });
    expect(invoiceReminderInfo({ ...inv, reminderCount: 2, lastReminderAt: "2026-10-17T15:00:00Z" }, tz, settings, "pro")).toEqual({ state: "sent", date: "2026-10-17" });
    expect(invoiceReminderInfo({ ...inv, status: "paid", reminderCount: 1, lastReminderAt: "2026-10-11T15:00:00Z" }, tz, settings, "pro")).toEqual({ state: "sent", date: "2026-10-11" });
    expect(invoiceReminderInfo({ ...inv, status: "draft" }, tz, settings, "pro")).toEqual({ state: "none" });
    expect(invoiceReminderInfo(inv, tz, settings, "free")).toEqual({ state: "off", reason: "plan" });
  });
});

describe("replaceTokens", () => {
  it("replaces every known token, and only those", () => {
    const text = TEMPLATE_TOKENS.map((t) => `{${t}}`).join(" ");
    expect(replaceTokens(text, SAMPLE_VALUES, { escape: false })).toBe(TEMPLATE_TOKENS.map((t) => SAMPLE_VALUES[t]).join(" "));
  });
  it("leaves unknown tokens, half tokens and odd braces untouched", () => {
    expect(replaceTokens("{unknown} {customer_name {number} {{number}} {NUMBER}", { number: "7" }, { escape: false })).toBe("{unknown} {customer_name 7 {7} {NUMBER}");
  });
  it("leaves a known token alone when no value is supplied", () => {
    expect(replaceTokens("Hi {customer_name}", {})).toBe("Hi {customer_name}");
  });
  it("escapes HTML in values by default", () => {
    expect(replaceTokens("Hi {customer_name}", { customer_name: `<script>alert("x")</script> & 'q'` })).toBe("Hi &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;");
  });
  it("never expands a token that appears inside a value", () => {
    expect(replaceTokens("Hi {customer_name}, see {link}", { customer_name: "{link}", link: "https://x.test" }, { escape: false })).toBe("Hi {link}, see https://x.test");
    expect(replaceTokens("{number}{number}", { number: "{number}" }, { escape: false })).toBe("{number}{number}");
  });
  it("copes with very large input and special regex characters in values", () => {
    const big = "{number} ".repeat(5000);
    expect(replaceTokens(big, { number: "$&$1" }, { escape: false }).startsWith("$&$1 $&$1")).toBe(true);
  });
});

describe("templates", () => {
  it("defaults exist for the three messages and use known tokens only", () => {
    for (const country of ["US", "UK", "AU"] as const) {
      const t = defaultTemplates(country);
      for (const body of Object.values(t)) {
        const used = [...body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
        expect(used.every((u) => (TEMPLATE_TOKENS as readonly string[]).includes(u))).toBe(true);
        expect(body.length).toBeLessThan(MAX_TEMPLATE_LENGTH);
      }
    }
    expect(defaultTemplates("US").quote_followup).toContain("Thanks,");
    expect(defaultTemplates("UK").quote_followup).toContain("Many thanks,");
    expect(defaultTemplates("AU").invoice_reminder_2).toContain("Kind regards,");
  });
  it("the second reminder is firmer but stays polite", () => {
    const t = defaultTemplates("UK");
    expect(t.invoice_reminder_1).toContain("friendly reminder");
    expect(t.invoice_reminder_2).toContain("still outstanding");
    expect(t.invoice_reminder_2).not.toMatch(/!|legal|final notice|immediately/i);
  });
  it("templateOrDefault falls back for blank or missing", () => {
    expect(templateOrDefault(null, "d")).toBe("d");
    expect(templateOrDefault("   ", "d")).toBe("d");
    expect(templateOrDefault("mine", "d")).toBe("mine");
  });
  it("bodyParagraphs splits on blank lines, strips tags and caps length", () => {
    expect(bodyParagraphs("Hi\n\n<b>there</b>\n\n\n\nbye")).toEqual(["Hi", "there", "bye"]);
    expect(bodyParagraphs("<script>x</script>ok")).toEqual(["xok"]);
    expect(bodyParagraphs("a".repeat(10000))[0].length).toBeLessThanOrEqual(MAX_TEMPLATE_LENGTH * 2);
    expect(bodyParagraphs("")).toEqual([]);
  });
  it("greeting falls back to 'there'", () => {
    expect(firstNameForGreeting("Sarah Thompson")).toBe("Sarah");
    expect(firstNameForGreeting("  ")).toBe("there");
    expect(firstNameForGreeting(null)).toBe("there");
  });
});

describe("reminderSettingsSchema", () => {
  const base = {
    enabled: true,
    quote_followup_enabled: true,
    quote_followup_days: "3",
    invoice_reminders_enabled: true,
    invoice_reminder_1_days: "1",
    invoice_reminder_2_days: "7",
    quote_followup_template: "",
    invoice_reminder_1_template: "",
    invoice_reminder_2_template: "",
  };
  it("parses numbers and turns blank templates into null (use the default)", () => {
    const r = reminderSettingsSchema.safeParse(base);
    expect(r.success && r.data).toMatchObject({ quote_followup_days: 3, invoice_reminder_1_days: 1, invoice_reminder_2_days: 7, quote_followup_template: null });
  });
  it("enforces the day ranges and that the second reminder follows the first", () => {
    for (const bad of [{ quote_followup_days: "0" }, { quote_followup_days: "15" }, { invoice_reminder_1_days: "15" }, { invoice_reminder_2_days: "2" }, { invoice_reminder_2_days: "31" }, { quote_followup_days: "x" }, { invoice_reminder_1_days: "5", invoice_reminder_2_days: "5" }, { invoice_reminder_1_days: "9", invoice_reminder_2_days: "8" }]) {
      expect(reminderSettingsSchema.safeParse({ ...base, ...bad }).success).toBe(false);
    }
    expect(reminderSettingsSchema.safeParse({ ...base, invoice_reminder_1_days: "14", invoice_reminder_2_days: "30" }).success).toBe(true);
  });
  it("limits templates to plain text of reasonable length", () => {
    expect(reminderSettingsSchema.safeParse({ ...base, quote_followup_template: "Hi {customer_name}" }).success).toBe(true);
    expect(reminderSettingsSchema.safeParse({ ...base, quote_followup_template: "<b>Hi</b>" }).success).toBe(false);
    expect(reminderSettingsSchema.safeParse({ ...base, invoice_reminder_1_template: "a".repeat(MAX_TEMPLATE_LENGTH + 1) }).success).toBe(false);
    expect(reminderSettingsSchema.safeParse({ ...base, invoice_reminder_2_template: "a".repeat(MAX_TEMPLATE_LENGTH) }).success).toBe(true);
  });
});
