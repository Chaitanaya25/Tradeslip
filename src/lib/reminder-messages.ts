import { formatDateOnly } from "./dates";
import type { ReminderInfo, SkipReason } from "./reminders";

/** Plain wording for why a manual "Send reminder now" was refused. */
export function skipReasonMessage(reason: SkipReason, entity: "quote" | "invoice", word: string): string {
  const doc = entity === "invoice" ? "invoice" : word.toLowerCase();
  switch (reason) {
    case "plan":
      return "Reminders are part of the paid plans. Upgrade to send them.";
    case "status":
      return entity === "invoice" ? "Only a sent invoice that is still unpaid can be reminded." : `This ${doc} isn't waiting for a reply, so there's nothing to follow up.`;
    case "expired":
      return `This ${doc} has expired.`;
    case "already_sent":
      return `A follow-up has already been sent for this ${doc}.`;
    case "max_reached":
      return "Both reminders have already been sent for this invoice.";
    case "no_email":
      return "Add an email address for this customer first.";
    case "unsubscribed":
      return "This customer asked not to get reminders, so none will be sent.";
    case "recent":
      return "A reminder went out in the last 24 hours. Try again tomorrow.";
    case "not_overdue":
      return "This invoice isn't overdue yet.";
    case "too_soon":
    case "window":
    case "disabled":
      return "Reminders can't be sent right now.";
  }
}

export const KIND_LABELS = {
  quote_followup: "Follow-up",
  invoice_reminder_1: "First reminder",
  invoice_reminder_2: "Second reminder",
} as const;

export const LOG_STATUS_LABELS = { sent: "Sent", failed: "Failed", skipped: "Skipped", pending: "Sending" } as const;

/** One line for a detail page, or null when there is nothing to say. `kind` is "Follow-up" for quotes, "Reminder" for invoices. */
export function reminderInfoText(info: ReminderInfo, entity: "quote" | "invoice", locale: string): string | null {
  switch (info.state) {
    case "sent":
      return `${entity === "quote" ? "Follow-up" : "Reminder"} sent on ${formatDateOnly(info.date, locale)}`;
    case "next":
      return `Next ${entity === "quote" ? "follow-up" : "reminder"}: ${formatDateOnly(info.date, locale)}`;
    case "off":
      return info.reason === "plan" ? "Automatic reminders are part of the paid plans" : "Reminders are off";
    case "none":
      return null;
  }
}
