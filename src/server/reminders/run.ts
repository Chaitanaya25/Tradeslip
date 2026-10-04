import "server-only";
import { invoiceReminderDue, quoteFollowupDue, settingsFromBusiness } from "@/lib/reminders";
import { remainingCents } from "@/lib/invoice-calc";
import type { Database } from "@/lib/supabase/types";
import { deliverReminder, targetFromInvoiceRow, targetFromQuoteRow, type DeliverIo, type DeliverResult, type ReminderTarget } from "./deliver";

type Tables = Database["public"]["Functions"];
export type DueQuoteRow = Tables["list_due_quote_followups"]["Returns"][number];
export type DueInvoiceRow = Tables["list_due_invoice_reminders"]["Returns"][number];

export const MAX_EMAILS_PER_RUN = 90;
export const CANDIDATE_LIMIT = 200;
export const SEND_DELAY_MS = 600;

export type RunSummary = { scanned: number; sent: number; skipped: number; failed: number; expired: number };

export type RunDeps = {
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  expire: () => Promise<number>;
  listQuotes: (now: Date, limit: number) => Promise<DueQuoteRow[]>;
  listInvoices: (now: Date, limit: number) => Promise<DueInvoiceRow[]>;
  deliver: (target: ReminderTarget) => Promise<DeliverResult>;
  maxEmails?: number;
  delayMs?: number;
};

/** Build the injected pieces for real use (admin client + Resend). Kept next to the runner so the route stays tiny. */
export function deliverWith(io: DeliverIo) {
  return (target: ReminderTarget) => deliverReminder(target, io);
}

/**
 * One cron run: expire old quotes, then send due reminders. Every candidate is re-checked here with the
 * same pure rules the database list approximates (including the 8am-6pm window), claimed exclusively,
 * sent, and finalised. Never retries an item within a run, stops early on a provider rate limit, and caps the
 * number of emails. Returns counts only; nothing personal is logged.
 */
export async function runReminders(deps: RunDeps): Promise<RunSummary> {
  const summary: RunSummary = { scanned: 0, sent: 0, skipped: 0, failed: 0, expired: 0 };
  const max = deps.maxEmails ?? MAX_EMAILS_PER_RUN;
  const delay = deps.delayMs ?? SEND_DELAY_MS;
  const now = deps.now();
  const errorCodes: Record<string, number> = {};

  try {
    summary.expired = await deps.expire();
  } catch {
    errorCodes.expire_failed = 1;
  }

  let invoices: DueInvoiceRow[] = [];
  let quotes: DueQuoteRow[] = [];
  try {
    [invoices, quotes] = await Promise.all([deps.listInvoices(now, CANDIDATE_LIMIT), deps.listQuotes(now, CANDIDATE_LIMIT)]);
  } catch {
    errorCodes.list_failed = 1;
  }
  summary.scanned = invoices.length + quotes.length;

  const candidates: { target: ReminderTarget }[] = [];
  for (const r of invoices) {
    const verdict = invoiceReminderDue(
      {
        status: "sent",
        dueDate: r.due_date,
        totalCents: r.total_cents,
        amountPaidCents: r.amount_paid_cents,
        reminderCount: r.reminder_count,
        lastReminderAt: r.last_reminder_at,
        customerEmail: r.customer_email,
      },
      now,
      r.timezone,
      settingsFromBusiness({
        reminders_enabled: r.reminders_enabled,
        quote_followup_enabled: true,
        quote_followup_days: 3,
        invoice_reminders_enabled: r.invoice_reminders_enabled,
        invoice_reminder_1_days: r.invoice_reminder_1_days,
        invoice_reminder_2_days: r.invoice_reminder_2_days,
      }),
      { plan: r.plan, unsubscribed: r.unsubscribed },
    );
    if (!verdict.due || remainingCents(r.total_cents, r.amount_paid_cents) <= 0) summary.skipped += 1;
    else candidates.push({ target: targetFromInvoiceRow({ ...r, reminder_kind: verdict.kind }) });
  }
  for (const r of quotes) {
    const verdict = quoteFollowupDue(
      { status: "sent", validUntil: r.valid_until, sentAt: r.sent_at, followupCount: r.followup_count, lastFollowupAt: r.last_followup_at, customerEmail: r.customer_email },
      now,
      r.timezone,
      settingsFromBusiness({
        reminders_enabled: r.reminders_enabled,
        quote_followup_enabled: r.quote_followup_enabled,
        quote_followup_days: r.quote_followup_days,
        invoice_reminders_enabled: true,
        invoice_reminder_1_days: 1,
        invoice_reminder_2_days: 7,
      }),
      { plan: r.plan, unsubscribed: r.unsubscribed },
    );
    if (!verdict.due) summary.skipped += 1;
    else candidates.push({ target: targetFromQuoteRow(r) });
  }

  let attempted = 0;
  for (const { target } of candidates) {
    if (attempted >= max) {
      summary.skipped += 1; // left for the next run
      continue;
    }
    if (attempted > 0 && delay > 0) await deps.sleep(delay);
    attempted += 1;

    let result: DeliverResult;
    try {
      result = await deps.deliver(target);
    } catch {
      summary.failed += 1;
      errorCodes.deliver_threw = (errorCodes.deliver_threw ?? 0) + 1;
      continue;
    }

    if (result.outcome === "sent") summary.sent += 1;
    else if (result.outcome === "claim_lost") summary.skipped += 1;
    else if (result.outcome === "skipped") {
      summary.skipped += 1;
      errorCodes[result.reason] = (errorCodes[result.reason] ?? 0) + 1;
    } else {
      summary.failed += 1;
      errorCodes[result.reason] = (errorCodes[result.reason] ?? 0) + 1;
      // Resend asked us to slow down: stop now; the rest are picked up by the next run.
      if (result.reason === "rate_limited") {
        const left = candidates.length - attempted;
        summary.skipped += Math.max(left, 0);
        break;
      }
    }
  }

  console.info("[reminders] run finished", { ...summary, errors: errorCodes });
  return summary;
}
