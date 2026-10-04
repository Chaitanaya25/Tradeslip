import { daysBetween, localDateOf, localHour } from "./dashboard";
import { derivedStatus, remainingCents, type StoredInvoiceStatus } from "./invoice-calc";
import { defaultValidUntil, todayInTimezone } from "./quote-calc";
import { isExpired } from "./quote-send";
import type { Country } from "./region";

/**
 * Rules for automatic reminders. Pure, so the same decisions can be unit tested, compared
 * with the SQL list functions (migration 011) on shared fixtures, and re-checked in the cron
 * run. The database narrows the candidates; these functions have the final say, including the
 * send window and the exact local-day maths.
 */

// --- Plan, window ---------------------------------------------------------------

/** Trial, Pro and Business send reminders; Free never does. Unknown plans do not. */
export function planAllowsReminders(plan: string): boolean {
  return plan === "trial" || plan === "pro" || plan === "business";
}

export const SEND_WINDOW_START = 8;
export const SEND_WINDOW_END = 18;

/** True from 08:00:00 until 17:59:59 local time (reads the hour in the zone, so DST just works). */
export function isWithinSendWindow(now: Date, timeZone: string, startHour = SEND_WINDOW_START, endHour = SEND_WINDOW_END): boolean {
  const hour = localHour(now, timeZone);
  return hour >= startHour && hour < endHour;
}

// --- Settings -------------------------------------------------------------------

export type ReminderSettings = {
  enabled: boolean;
  quoteFollowupEnabled: boolean;
  quoteFollowupDays: number;
  invoiceRemindersEnabled: boolean;
  invoiceReminder1Days: number;
  invoiceReminder2Days: number;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  quoteFollowupEnabled: true,
  quoteFollowupDays: 3,
  invoiceRemindersEnabled: true,
  invoiceReminder1Days: 1,
  invoiceReminder2Days: 7,
};

export type BusinessReminderColumns = {
  reminders_enabled: boolean;
  quote_followup_enabled: boolean;
  quote_followup_days: number;
  invoice_reminders_enabled: boolean;
  invoice_reminder_1_days: number;
  invoice_reminder_2_days: number;
};

export function settingsFromBusiness(b: BusinessReminderColumns): ReminderSettings {
  return {
    enabled: b.reminders_enabled,
    quoteFollowupEnabled: b.quote_followup_enabled,
    quoteFollowupDays: b.quote_followup_days,
    invoiceRemindersEnabled: b.invoice_reminders_enabled,
    invoiceReminder1Days: b.invoice_reminder_1_days,
    invoiceReminder2Days: b.invoice_reminder_2_days,
  };
}

// --- Eligibility ------------------------------------------------------------------

export type ReminderKind = "quote_followup" | "invoice_reminder_1" | "invoice_reminder_2";

export type SkipReason =
  | "plan"
  | "disabled"
  | "status"
  | "expired"
  | "already_sent"
  | "no_email"
  | "unsubscribed"
  | "too_soon"
  | "recent"
  | "window"
  | "not_overdue"
  | "max_reached";

export type DueResult<K extends ReminderKind> = { due: true; kind: K } | { due: false; reason: SkipReason };

export type DueContext = {
  plan: string;
  /** The customer's address is on the business's unsubscribe list. */
  unsubscribed: boolean;
  /**
   * An owner pressed "Send reminder now": the send window and the waiting days are skipped, and the
   * on/off switches are not consulted (they chose to send). Plan, unsubscribe, the 24-hour rule,
   * the maximum count, status and an email on file still apply.
   */
  manual?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const recentlyReminded = (lastAt: string | null, now: Date) => lastAt !== null && now.getTime() - new Date(lastAt).getTime() < DAY_MS;
const hasEmail = (email: string | null | undefined) => Boolean(email?.trim());

export type QuoteForFollowup = {
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  validUntil: string | null;
  sentAt: string | null;
  followupCount: number;
  lastFollowupAt: string | null;
  customerEmail: string | null;
};

/** One polite follow-up for a quote nobody has answered. */
export function quoteFollowupDue(quote: QuoteForFollowup, now: Date, timeZone: string, settings: ReminderSettings, ctx: DueContext): DueResult<"quote_followup"> {
  const today = todayInTimezone(timeZone, now);
  const no = (reason: SkipReason): DueResult<"quote_followup"> => ({ due: false, reason });

  if (!planAllowsReminders(ctx.plan)) return no("plan");
  if (!ctx.manual && (!settings.enabled || !settings.quoteFollowupEnabled)) return no("disabled");
  if (quote.status !== "sent" && quote.status !== "viewed") return no("status");
  if (isExpired(quote.validUntil, today)) return no("expired");
  if (quote.followupCount >= 1) return no("already_sent");
  if (!hasEmail(quote.customerEmail)) return no("no_email");
  if (ctx.unsubscribed) return no("unsubscribed");
  if (recentlyReminded(quote.lastFollowupAt, now)) return no("recent");
  if (!ctx.manual) {
    if (!quote.sentAt || daysBetween(localDateOf(quote.sentAt, timeZone), today) < settings.quoteFollowupDays) return no("too_soon");
    if (!isWithinSendWindow(now, timeZone)) return no("window");
  }
  return { due: true, kind: "quote_followup" };
}

export type InvoiceForReminder = {
  status: StoredInvoiceStatus;
  dueDate: string;
  totalCents: number;
  amountPaidCents: number;
  reminderCount: number;
  lastReminderAt: string | null;
  customerEmail: string | null;
};

/**
 * Reminder 1 one day (default) after the due date; reminder 2 seven days after it (or six days
 * after reminder 1). Overdue includes part-paid invoices that are past due. At most two, never within 24 hours.
 */
export function invoiceReminderDue(
  invoice: InvoiceForReminder,
  now: Date,
  timeZone: string,
  settings: ReminderSettings,
  ctx: DueContext,
): DueResult<"invoice_reminder_1" | "invoice_reminder_2"> {
  const today = todayInTimezone(timeZone, now);
  const no = (reason: SkipReason): DueResult<"invoice_reminder_1" | "invoice_reminder_2"> => ({ due: false, reason });
  const remaining = remainingCents(invoice.totalCents, invoice.amountPaidCents);

  if (!planAllowsReminders(ctx.plan)) return no("plan");
  if (!ctx.manual && (!settings.enabled || !settings.invoiceRemindersEnabled)) return no("disabled");
  if (invoice.status !== "sent" && invoice.status !== "viewed") return no("status");
  if (derivedStatus(invoice.status, invoice.dueDate, today, remaining, invoice.amountPaidCents) !== "overdue") return no("not_overdue");
  if (invoice.reminderCount >= 2) return no("max_reached");
  if (!hasEmail(invoice.customerEmail)) return no("no_email");
  if (ctx.unsubscribed) return no("unsubscribed");
  if (recentlyReminded(invoice.lastReminderAt, now)) return no("recent");

  const kind = invoice.reminderCount === 0 ? "invoice_reminder_1" : "invoice_reminder_2";
  if (!ctx.manual) {
    if (kind === "invoice_reminder_1") {
      if (today < defaultValidUntil(invoice.dueDate, settings.invoiceReminder1Days)) return no("too_soon");
    } else {
      const byDue = today >= defaultValidUntil(invoice.dueDate, settings.invoiceReminder2Days);
      const byLast = invoice.lastReminderAt !== null && today >= defaultValidUntil(localDateOf(invoice.lastReminderAt, timeZone), 6);
      if (!byDue && !byLast) return no("too_soon");
    }
    if (!isWithinSendWindow(now, timeZone)) return no("window");
  }
  return { due: true, kind };
}

/** What a detail page says about reminders for one document. Dates are yyyy-mm-dd (business-local). */
export type ReminderInfo =
  | { state: "sent"; date: string }
  | { state: "next"; date: string }
  | { state: "off"; reason: "plan" | "disabled" }
  | { state: "none" };

export function quoteReminderInfo(quote: QuoteForFollowup, timeZone: string, settings: ReminderSettings, plan: string): ReminderInfo {
  if (quote.followupCount >= 1 && quote.lastFollowupAt) return { state: "sent", date: localDateOf(quote.lastFollowupAt, timeZone) };
  if (quote.status !== "sent" && quote.status !== "viewed") return { state: "none" };
  if (!planAllowsReminders(plan)) return { state: "off", reason: "plan" };
  if (!settings.enabled || !settings.quoteFollowupEnabled) return { state: "off", reason: "disabled" };
  if (!quote.sentAt) return { state: "none" };
  return { state: "next", date: defaultValidUntil(localDateOf(quote.sentAt, timeZone), settings.quoteFollowupDays) };
}

export function invoiceReminderInfo(invoice: InvoiceForReminder, timeZone: string, settings: ReminderSettings, plan: string): ReminderInfo {
  const open = invoice.status === "sent" || invoice.status === "viewed";
  if (invoice.reminderCount >= 2 && invoice.lastReminderAt) return { state: "sent", date: localDateOf(invoice.lastReminderAt, timeZone) };
  if (!open) return invoice.reminderCount >= 1 && invoice.lastReminderAt ? { state: "sent", date: localDateOf(invoice.lastReminderAt, timeZone) } : { state: "none" };
  if (!planAllowsReminders(plan)) return { state: "off", reason: "plan" };
  if (!settings.enabled || !settings.invoiceRemindersEnabled) return { state: "off", reason: "disabled" };
  if (invoice.reminderCount === 0) return { state: "next", date: defaultValidUntil(invoice.dueDate, settings.invoiceReminder1Days) };
  const byDue = defaultValidUntil(invoice.dueDate, settings.invoiceReminder2Days);
  const byLast = invoice.lastReminderAt ? defaultValidUntil(localDateOf(invoice.lastReminderAt, timeZone), 6) : byDue;
  return { state: "next", date: byDue < byLast ? byDue : byLast };
}

// --- Templates -------------------------------------------------------------------

export const TEMPLATE_TOKENS = ["customer_name", "business_name", "document_word", "number", "total", "balance_due", "due_date", "link"] as const;
export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];
export type TemplateValues = Record<TemplateToken, string>;

export const TEMPLATE_TOKEN_HELP: Record<TemplateToken, string> = {
  customer_name: "The customer's first name",
  business_name: "Your business name",
  document_word: "Estimate or quote (invoice for invoices)",
  number: "The document number",
  total: "The total amount",
  balance_due: "What is still owed",
  due_date: "The invoice due date",
  link: "The link to the document",
};

export const MAX_TEMPLATE_LENGTH = 1500;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
const TOKEN_RE = new RegExp(`\\{(${TEMPLATE_TOKENS.join("|")})\\}`, "g");

/**
 * Replace the known {tokens} in one pass. Unknown tokens are left as typed, and a value that itself
 * contains "{link}" stays literal (values are never expanded again). Values are HTML-escaped by
 * default; the email renderer passes `escape: false` because React already escapes text.
 */
export function replaceTokens(template: string, values: Partial<TemplateValues>, options: { escape?: boolean } = {}): string {
  const escape = options.escape ?? true;
  return template.replace(TOKEN_RE, (match, name: TemplateToken) => {
    const value = values[name];
    if (value === undefined) return match;
    return escape ? escapeHtml(value) : value;
  });
}

/** The message as plain paragraphs: split on blank lines, anything tag-like removed, length capped. */
export function bodyParagraphs(text: string): string[] {
  return text
    .slice(0, MAX_TEMPLATE_LENGTH * 2)
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export type DefaultTemplates = { quote_followup: string; invoice_reminder_1: string; invoice_reminder_2: string };

/** Short and polite. US uses "Thanks"; UK and AU use "Many thanks" and "Kind regards". */
export function defaultTemplates(country: Country): DefaultTemplates {
  const thanks = country === "US" ? "Thanks," : "Many thanks,";
  const closing = country === "US" ? "Thank you," : "Kind regards,";
  return {
    quote_followup: `Hi {customer_name},\n\nJust a quick note to check you received the {document_word} #{number} for {total}. If you have any questions, or would like anything changed, just reply to this email.\n\n${thanks}\n{business_name}`,
    invoice_reminder_1: `Hi {customer_name},\n\nA friendly reminder that invoice #{number} for {balance_due} was due on {due_date}. If you've already paid, thank you, and please ignore this note.\n\n${thanks}\n{business_name}`,
    invoice_reminder_2: `Hi {customer_name},\n\nI'm following up on invoice #{number}, which is now past its due date of {due_date}. The balance of {balance_due} is still outstanding. Please let me know when you expect to pay, or get in touch if there is a problem.\n\n${closing}\n{business_name}`,
  };
}

/** The saved template, or the default when it is blank. */
export function templateOrDefault(saved: string | null | undefined, fallback: string): string {
  return saved && saved.trim() ? saved : fallback;
}

export const SAMPLE_VALUES: TemplateValues = {
  customer_name: "Sarah",
  business_name: "Miller Plumbing",
  document_word: "estimate",
  number: "1047",
  total: "$334.80",
  balance_due: "$234.80",
  due_date: "Oct 15, 2026",
  link: "https://example.com/i/sample",
};

/** The first name for {customer_name}, or "there" when there is none ("Hi there,"). */
export function firstNameForGreeting(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}
