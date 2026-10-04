import { daysOverdue, derivedStatus, remainingCents, type StoredInvoiceStatus } from "./invoice-calc";
import { defaultValidUntil } from "./quote-calc";
import { isExpired } from "./quote-send";

/** Pure helpers behind the dashboard. Same definitions as the invoice and quote pages. */

/** The business-local hour (0-23) of an instant. */
export function localHour(now: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(now).find((p) => p.type === "hour");
  return Number(h?.value ?? 0) % 24;
}

/** Business-local calendar date (yyyy-mm-dd) of an instant. */
export function localDateOf(timestamp: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

/** "Morning" before noon, "Afternoon" until 5pm, then "Evening" (by the business-local hour). */
export function greetingFor(now: Date, timeZone: string): "Morning" | "Afternoon" | "Evening" {
  const hour = localHour(now, timeZone);
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

/** "Tuesday, 14 October" (UK/AU) or "Tuesday, October 14" (US), in the business timezone. */
export function formatDashboardDate(now: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long" }).format(now);
}

/** First word of a display name ("Dave Miller" -> "Dave"). */
export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}

/** Whole-percent change vs the previous month. Null when there is nothing to compare with (never divides by zero). */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function compareLabel(pct: number | null): string | null {
  if (pct === null) return null;
  if (pct === 0) return "same as last month";
  return pct > 0 ? `up ${pct}% vs last month` : `down ${Math.abs(pct)}% vs last month`;
}

// --- Needs attention -------------------------------------------------------------

export type AttentionCustomer = { name: string | null; email: string | null; phone: string | null };

export type AttentionInvoice = {
  id: string;
  number: number;
  status: StoredInvoiceStatus;
  dueDate: string;
  totalCents: number;
  amountPaidCents: number;
  customer: AttentionCustomer;
  /** Public link for the Send sheet (only for sent / viewed invoices). */
  link: string | null;
};

export type AttentionQuote = {
  id: string;
  number: number;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  validUntil: string | null;
  sentAt: string | null;
  totalCents: number;
  customer: AttentionCustomer;
  link: string | null;
};

export type AttentionType = "overdue_invoice" | "expiring_quote" | "no_reply" | "create_invoice";

export type AttentionItem = {
  key: string;
  type: AttentionType;
  /** Overdue items get the red-tinted icon tile. */
  tone: "bad" | "neutral";
  title: string;
  meta: string;
  actionLabel: string;
  href: string;
  /** What the Send sheet needs (link + contact), when the action opens it. */
  share: { kind: "invoice" | "quote"; id: string; link: string; customer: AttentionCustomer; docLabel: string } | null;
  /** Set for "Create invoice". */
  quoteId: string | null;
};

export const MAX_ATTENTION_ITEMS = 5;
export const NO_REPLY_DAYS = 3;

const nameOf = (c: AttentionCustomer) => c.name?.trim() || "A customer";
const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

/**
 * The "Needs attention" list: overdue invoices (oldest due first), quotes expiring today or
 * tomorrow, quotes sent 3+ days ago with no reply, then accepted quotes with no invoice.
 * Sorted by that priority, capped at 5. A quote appears once, under its most urgent reason.
 */
export function buildNeedsAttention(input: {
  invoices: readonly AttentionInvoice[];
  quotes: readonly AttentionQuote[];
  /** Quote ids that already have a non-void invoice. */
  quotesWithInvoice: ReadonlySet<string>;
  today: string;
  timeZone: string;
  quoteWord: string;
  money: (cents: number) => string;
  quoteLabel: (number: number) => string;
  invoiceLabel: (number: number) => string;
}): AttentionItem[] {
  const { today, timeZone, money } = input;
  const tomorrow = defaultValidUntil(today, 1);
  const items: AttentionItem[] = [];

  const overdue = input.invoices
    .filter((i) => {
      const remaining = remainingCents(i.totalCents, i.amountPaidCents);
      return derivedStatus(i.status, i.dueDate, today, remaining, i.amountPaidCents) === "overdue";
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number - b.number);
  for (const i of overdue) {
    const days = daysOverdue(i.dueDate, today);
    const label = input.invoiceLabel(i.number);
    items.push({
      key: `invoice:${i.id}`,
      type: "overdue_invoice",
      tone: "bad",
      title: `${nameOf(i.customer)}'s invoice is ${plural(days, "day")} overdue`,
      meta: `${money(remainingCents(i.totalCents, i.amountPaidCents))} • Invoice #${label}`,
      actionLabel: "Send reminder",
      href: `/invoices/${i.id}`,
      share: i.link ? { kind: "invoice", id: i.id, link: i.link, customer: i.customer, docLabel: "Invoice" } : null,
      quoteId: null,
    });
  }

  const open = input.quotes.filter((q) => (q.status === "sent" || q.status === "viewed") && !isExpired(q.validUntil, today));
  const used = new Set<string>();

  const expiring = open
    .filter((q) => q.validUntil === today || q.validUntil === tomorrow)
    .sort((a, b) => (a.validUntil ?? "").localeCompare(b.validUntil ?? "") || a.number - b.number);
  for (const q of expiring) {
    used.add(q.id);
    items.push({
      key: `quote-expiring:${q.id}`,
      type: "expiring_quote",
      tone: "neutral",
      title: `${input.quoteWord} for ${nameOf(q.customer)} expires ${q.validUntil === today ? "today" : "tomorrow"}`,
      meta: `${money(q.totalCents)} • ${input.quoteWord} #${input.quoteLabel(q.number)}`,
      actionLabel: "View quote",
      href: `/quotes/${q.id}`,
      share: null,
      quoteId: null,
    });
  }

  const noReply = open
    .filter((q) => !used.has(q.id) && q.sentAt && daysBetween(localDateOf(q.sentAt, timeZone), today) >= NO_REPLY_DAYS)
    .sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? "") || a.number - b.number);
  for (const q of noReply) {
    const days = daysBetween(localDateOf(q.sentAt as string, timeZone), today);
    items.push({
      key: `quote-noreply:${q.id}`,
      type: "no_reply",
      tone: "neutral",
      title: `${nameOf(q.customer)} hasn't replied`,
      meta: `Sent ${days} days ago • ${money(q.totalCents)}`,
      actionLabel: "Send follow up",
      href: `/quotes/${q.id}`,
      share: q.link ? { kind: "quote", id: q.id, link: q.link, customer: q.customer, docLabel: input.quoteWord } : null,
      quoteId: null,
    });
  }

  const accepted = input.quotes
    .filter((q) => q.status === "accepted" && !input.quotesWithInvoice.has(q.id))
    .sort((a, b) => a.number - b.number);
  for (const q of accepted) {
    items.push({
      key: `quote-invoice:${q.id}`,
      type: "create_invoice",
      tone: "neutral",
      title: `${nameOf(q.customer)} accepted ${input.quoteWord.toLowerCase()} #${input.quoteLabel(q.number)}`,
      meta: `${money(q.totalCents)} • No invoice yet`,
      actionLabel: "Create invoice",
      href: `/quotes/${q.id}`,
      share: null,
      quoteId: q.id,
    });
  }

  return items.slice(0, MAX_ATTENTION_ITEMS);
}

/** Whole days from `from` to `to` (yyyy-mm-dd both). Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
