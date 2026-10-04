"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import { EMAIL_DELIVERED, EMAIL_MESSAGES } from "@/lib/email-errors";
import { fieldErrorsFromIssues } from "@/lib/forms";
import { remainingCents } from "@/lib/invoice-calc";
import { checkRateLimits, userSubject } from "@/lib/rate-limit";
import { skipReasonMessage } from "@/lib/reminder-messages";
import { resolveUnsubscribeSecret } from "@/lib/reminder-token";
import {
  MAX_TEMPLATE_LENGTH,
  SAMPLE_VALUES,
  defaultTemplates,
  invoiceReminderDue,
  planAllowsReminders,
  quoteFollowupDue,
  settingsFromBusiness,
  templateOrDefault,
  type ReminderKind,
} from "@/lib/reminders";
import { quoteWord } from "@/lib/region";
import { reminderSettingsSchema, type ReminderSettingsFormValues } from "@/lib/schemas/reminders";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/server/email/send";
import { buildReminderMessage, deliverReminder, targetFromInvoiceRow, targetFromQuoteRow, type ReminderTarget } from "@/server/reminders/deliver";
import { appUrl, liveDeliverIo } from "@/server/reminders/live";
import { actionBusinessContext } from "./context";

const idSchema = z.uuid();

/**
 * Save Settings > Reminders. Only these columns can be written; plan and billing never. On the free plan
 * nothing can be switched on (the cron's SQL lists refuse free-plan businesses as well).
 */
export async function saveReminderSettings(raw: ReminderSettingsFormValues): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;

  const parsed = reminderSettingsSchema.safeParse(raw);
  if (!parsed.success) return failure("Check the highlighted fields.", fieldErrorsFromIssues(parsed.error.issues));
  const v = parsed.data;

  if (!planAllowsReminders(ctx.business.plan) && (v.enabled || v.quote_followup_enabled || v.invoice_reminders_enabled)) {
    return failure("Automatic reminders are part of the paid plans. Upgrade to switch them on.");
  }

  const { error } = await ctx.supabase
    .from("businesses")
    .update({
      reminders_enabled: v.enabled,
      quote_followup_enabled: v.quote_followup_enabled,
      quote_followup_days: v.quote_followup_days,
      invoice_reminders_enabled: v.invoice_reminders_enabled,
      invoice_reminder_1_days: v.invoice_reminder_1_days,
      invoice_reminder_2_days: v.invoice_reminder_2_days,
      quote_followup_template: v.quote_followup_template,
      invoice_reminder_1_template: v.invoice_reminder_1_template,
      invoice_reminder_2_template: v.invoice_reminder_2_template,
    })
    .eq("id", ctx.business.id);
  if (error) return failure("We couldn't save your changes. Try again.");

  revalidatePath("/settings/reminders");
  return { ok: true };
}

const testInput = z.object({
  kind: z.enum(["quote_followup", "invoice_reminder_1", "invoice_reminder_2"]),
  /** The text currently in the editor (may be unsaved). Blank = the default. */
  template: z.string().max(MAX_TEMPLATE_LENGTH, "That is too long."),
});

/** Send the chosen message, filled with sample data, to the business's own email address only. 3 per hour. */
export async function sendTestReminder(kind: ReminderKind, template: string): Promise<ActionResult<{ message: string }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;

  const input = testInput.safeParse({ kind, template });
  if (!input.success || /[<>]/.test(input.data.template)) return failure("Use plain text only, up to 1,500 characters.");
  if (!planAllowsReminders(ctx.business.plan)) return failure("Reminders are part of the paid plans.");

  const to = ctx.business.email?.trim();
  if (!to) return failure("Add your business email in Settings first. The test goes to that address.");

  const { allowed } = await checkRateLimits([{ subject: userSubject(ctx.user.id), key: "reminder-test", limit: 3 }], { windowMs: 60 * 60 * 1000 });
  if (!allowed) return failure("You've sent 3 test reminders this hour. Try again later.");

  const secret = resolveUnsubscribeSecret();
  if (!secret) return failure("Reminders aren't fully set up on the server yet (the unsubscribe secret is missing).");

  const business = ctx.business;
  const entity = kind === "quote_followup" ? "quote" : "invoice";
  const target: ReminderTarget = {
    entity,
    id: "00000000-0000-0000-0000-000000000000",
    kind,
    businessId: business.id,
    label: SAMPLE_VALUES.number,
    customerName: "Sarah Thompson",
    customerEmail: to,
    businessName: business.name,
    businessEmail: business.email,
    country: business.country,
    currency: business.currency,
    plan: business.plan,
    logoPath: business.logo_path,
    planBranding: business.plan === "trial" || business.plan === "free",
    template: null,
    publicToken: "sample-token-not-a-real-link-0000000000",
    totalCents: 33480,
    balanceCents: 23480,
    partPaid: false,
    dueDate: new Date(Date.now() - 4 * 86400_000).toISOString().slice(0, 10),
  };
  const text = templateOrDefault(input.data.template, defaultTemplates(business.country)[kind]);
  const message = buildReminderMessage(target, { appUrl: appUrl(), unsubscribeSecret: secret, templateOverride: text });

  const result = await sendEmail({
    businessName: business.name,
    to: message.to,
    replyTo: business.email,
    subject: `[Test] ${message.subject}`,
    react: message.react,
    headers: message.headers,
  });
  if (!result.ok) return failure(EMAIL_MESSAGES[result.reason]);
  return { ok: true, message: `${EMAIL_DELIVERED.replace("the customer", "you")} It was sent to your business email only.` };
}

const manualInput = z.object({ entity: z.enum(["quote", "invoice"]), id: z.string() });

/**
 * "Send reminder now" from a detail page or the dashboard. Uses the same claim -> send -> finalize pipeline
 * as the cron run, to the customer's address ON FILE (never one typed in the browser). It skips the 8am-6pm window and
 * the waiting days, but still enforces plan, the unsubscribe list, the 24-hour rule and the maximum count, so a manual
 * send uses up the next automatic reminder instead of adding to it.
 */
export async function sendReminderNow(entity: "quote" | "invoice", id: string): Promise<ActionResult<{ message: string }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  const input = manualInput.safeParse({ entity, id });
  if (!input.success || !idSchema.safeParse(id).success) return failure("That document no longer exists.");

  const { allowed } = await checkRateLimits([{ subject: userSubject(ctx.user.id), key: "reminder-now", limit: 10 }]);
  if (!allowed) return failure("Too many reminders at once. Wait a minute and try again.");

  const { business, supabase } = ctx;
  const word = quoteWord(business.country);
  const settings = settingsFromBusiness(business);
  const now = new Date();
  let target: ReminderTarget;
  let verdict: { due: true; kind: ReminderKind } | { due: false; reason: Parameters<typeof skipReasonMessage>[0] };

  if (entity === "quote") {
    const { data: q } = await supabase
      .from("quotes")
      .select("id, number, status, valid_until, sent_at, followup_count, last_followup_at, total_cents, currency, public_token, customers(name, email)")
      .eq("id", id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (!q) return failure("That quote no longer exists.");
    const email = q.customers?.email?.trim() ?? "";
    const unsubscribed = email ? await isUnsubscribed(business.id, email) : false;
    verdict = quoteFollowupDue(
      { status: q.status, validUntil: q.valid_until, sentAt: q.sent_at, followupCount: q.followup_count, lastFollowupAt: q.last_followup_at, customerEmail: email },
      now,
      business.timezone,
      settings,
      { plan: business.plan, unsubscribed, manual: true },
    );
    target = targetFromQuoteRow({
      entity_id: q.id,
      business_id: business.id,
      number: q.number,
      number_prefix: business.quote_prefix,
      total_cents: q.total_cents,
      currency: q.currency,
      public_token: q.public_token,
      customer_name: q.customers?.name ?? null,
      customer_email: email,
      business_name: business.name,
      business_email: business.email,
      country: business.country,
      plan: business.plan,
      logo_path: business.logo_path,
      plan_branding: business.plan === "trial" || business.plan === "free",
      template: business.quote_followup_template,
    });
  } else {
    const { data: i } = await supabase
      .from("invoices")
      .select("id, number, status, due_date, total_cents, amount_paid_cents, reminder_count, last_reminder_at, currency, public_token, customers(name, email)")
      .eq("id", id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (!i) return failure("That invoice no longer exists.");
    const email = i.customers?.email?.trim() ?? "";
    const unsubscribed = email ? await isUnsubscribed(business.id, email) : false;
    verdict = invoiceReminderDue(
      { status: i.status, dueDate: i.due_date, totalCents: i.total_cents, amountPaidCents: i.amount_paid_cents, reminderCount: i.reminder_count, lastReminderAt: i.last_reminder_at, customerEmail: email },
      now,
      business.timezone,
      settings,
      { plan: business.plan, unsubscribed, manual: true },
    );
    const kind = i.reminder_count === 0 ? "invoice_reminder_1" : "invoice_reminder_2";
    target = targetFromInvoiceRow({
      entity_id: i.id,
      business_id: business.id,
      number: i.number,
      number_prefix: business.invoice_prefix,
      total_cents: i.total_cents,
      amount_paid_cents: i.amount_paid_cents,
      currency: i.currency,
      due_date: i.due_date,
      public_token: i.public_token,
      customer_name: i.customers?.name ?? null,
      customer_email: email,
      business_name: business.name,
      business_email: business.email,
      country: business.country,
      plan: business.plan,
      logo_path: business.logo_path,
      plan_branding: business.plan === "trial" || business.plan === "free",
      template: kind === "invoice_reminder_1" ? business.invoice_reminder_1_template : business.invoice_reminder_2_template,
      reminder_kind: kind,
    });
    if (remainingCents(i.total_cents, i.amount_paid_cents) <= 0 && verdict.due) verdict = { due: false, reason: "not_overdue" };
  }

  if (!verdict.due) return failure(skipReasonMessage(verdict.reason, entity, word));

  const result = await deliverReminder(target, liveDeliverIo());
  revalidatePath(entity === "quote" ? `/quotes/${id}` : `/invoices/${id}`);
  revalidatePath("/dashboard");

  switch (result.outcome) {
    case "sent":
      return { ok: true, message: `Reminder sent to ${target.customerName?.trim() || "the customer"}. ${EMAIL_DELIVERED}` };
    case "claim_lost":
      return failure("A reminder for this was just sent or is being sent. Check the activity list.");
    case "skipped":
      return failure(EMAIL_MESSAGES.invalid_address);
    case "failed":
      return failure(result.reason === "unsubscribe_secret_missing" || result.reason === "no_recipient" ? "Reminders aren't fully set up on the server yet." : EMAIL_MESSAGES[result.reason]);
  }
}

async function isUnsubscribed(businessId: string, email: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("is_unsubscribed", { p_business_id: businessId, p_email: email });
  // If the list cannot be read, treat the address as unsubscribed rather than risk emailing someone who opted out.
  return error ? true : data === true;
}
