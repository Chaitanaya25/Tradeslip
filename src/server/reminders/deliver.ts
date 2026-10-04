import "server-only";
import { createElement } from "react";
import { formatDateOnly } from "@/lib/dates";
import type { EmailFailure } from "@/lib/email-errors";
import { formatMoney } from "@/lib/money";
import { createUnsubscribeToken } from "@/lib/reminder-token";
import {
  bodyParagraphs,
  defaultTemplates,
  firstNameForGreeting,
  replaceTokens,
  templateOrDefault,
  type ReminderKind,
  type TemplateValues,
} from "@/lib/reminders";
import { REGIONS, quoteWord, type Country } from "@/lib/region";
import { buildPublicInvoiceUrl, buildPublicUrl } from "@/lib/share-links";
import { logoPublicUrl } from "@/lib/supabase/storage";
import type { SendResult } from "@/server/email/send";
import { InvoiceReminderEmail, QuoteFollowupEmail } from "@/server/email/templates/reminder";

/**
 * Building and sending ONE reminder: claim -> render -> send -> finalize. Shared by the cron run and
 * the manual "Send reminder now" action. The recipient is always the customer address on file
 * (it comes from the database row, never from the browser). Everything external is injected so tests
 * use fakes and never send real mail.
 */

export type ReminderTarget = {
  entity: "quote" | "invoice";
  id: string;
  kind: ReminderKind;
  businessId: string;
  /** Prefix + number, e.g. "INV-1001". */
  label: string;
  customerName: string | null;
  customerEmail: string;
  businessName: string;
  businessEmail: string | null;
  country: Country;
  currency: string;
  plan: string;
  logoPath: string | null;
  planBranding: boolean;
  /** The saved template for this message, or null for the default. */
  template: string | null;
  publicToken: string;
  totalCents: number;
  /** Invoices: what is still owed. */
  balanceCents: number | null;
  /** Invoices: part has been paid. */
  partPaid: boolean;
  /** Invoice due date (yyyy-mm-dd). */
  dueDate: string | null;
};

export type DueQuoteInput = {
  entity_id: string;
  business_id: string;
  number: number;
  number_prefix: string;
  total_cents: number;
  currency: string;
  public_token: string;
  customer_name: string | null;
  customer_email: string | null;
  business_name: string;
  business_email: string | null;
  country: Country;
  plan: string;
  logo_path: string | null;
  plan_branding: boolean;
  template: string | null;
};

export type DueInvoiceInput = Omit<DueQuoteInput, "entity_id"> & {
  entity_id: string;
  amount_paid_cents: number;
  due_date: string;
  reminder_kind: "invoice_reminder_1" | "invoice_reminder_2";
};

export function targetFromQuoteRow(r: DueQuoteInput): ReminderTarget {
  return {
    entity: "quote",
    id: r.entity_id,
    kind: "quote_followup",
    businessId: r.business_id,
    label: `${r.number_prefix}${r.number}`,
    customerName: r.customer_name,
    customerEmail: (r.customer_email ?? "").trim(),
    businessName: r.business_name,
    businessEmail: r.business_email,
    country: r.country,
    currency: r.currency,
    plan: r.plan,
    logoPath: r.logo_path,
    planBranding: r.plan_branding,
    template: r.template,
    publicToken: r.public_token,
    totalCents: r.total_cents,
    balanceCents: null,
    partPaid: false,
    dueDate: null,
  };
}

export function targetFromInvoiceRow(r: DueInvoiceInput): ReminderTarget {
  return {
    entity: "invoice",
    id: r.entity_id,
    kind: r.reminder_kind,
    businessId: r.business_id,
    label: `${r.number_prefix}${r.number}`,
    customerName: r.customer_name,
    customerEmail: (r.customer_email ?? "").trim(),
    businessName: r.business_name,
    businessEmail: r.business_email,
    country: r.country,
    currency: r.currency,
    plan: r.plan,
    logoPath: r.logo_path,
    planBranding: r.plan_branding,
    template: r.template,
    publicToken: r.public_token,
    totalCents: r.total_cents,
    balanceCents: Math.max(r.total_cents - r.amount_paid_cents, 0),
    partPaid: r.amount_paid_cents > 0,
    dueDate: r.due_date,
  };
}

/** Values for the {tokens}. `document_word` is "estimate" / "quote" / "invoice" (lower case). */
export function valuesForTarget(t: ReminderTarget, appUrl: string): TemplateValues {
  const locale = REGIONS[t.country].locale;
  const money = (cents: number) => formatMoney(cents, t.currency, locale);
  return {
    customer_name: firstNameForGreeting(t.customerName),
    business_name: t.businessName,
    document_word: t.entity === "quote" ? quoteWord(t.country).toLowerCase() : "invoice",
    number: t.label,
    total: money(t.totalCents),
    balance_due: money(t.balanceCents ?? t.totalCents),
    due_date: t.dueDate ? formatDateOnly(t.dueDate, locale) : "",
    link: t.entity === "quote" ? buildPublicUrl(appUrl, t.publicToken) : buildPublicInvoiceUrl(appUrl, t.publicToken),
  };
}

export function subjectFor(t: ReminderTarget): string {
  if (t.entity === "quote") return `Following up: ${quoteWord(t.country).toLowerCase()} #${t.label} from ${t.businessName}`;
  return t.kind === "invoice_reminder_1" ? `Reminder: invoice #${t.label} from ${t.businessName}` : `Following up: invoice #${t.label} from ${t.businessName}`;
}

/** The finished message: addressed to the customer on file, with a signed unsubscribe link in the footer and the header. */
export function buildReminderMessage(t: ReminderTarget, opts: { appUrl: string; unsubscribeSecret: string; templateOverride?: string }) {
  const values = valuesForTarget(t, opts.appUrl);
  const template = opts.templateOverride ?? templateOrDefault(t.template, defaultTemplates(t.country)[t.kind]);
  // The email renders text through React (which escapes it), so values are not escaped twice here.
  const paragraphs = bodyParagraphs(replaceTokens(template, values, { escape: false }));
  const unsubscribeUrl = `${opts.appUrl.replace(/\/+$/, "")}/unsubscribe/${createUnsubscribeToken(t.businessId, t.customerEmail, opts.unsubscribeSecret)}`;

  const props = {
    businessName: t.businessName,
    logoUrl: logoPublicUrl(t.logoPath),
    paragraphs,
    documentWord: values.document_word,
    link: values.link,
    unsubscribeUrl,
    partialBalanceText: t.entity === "invoice" && t.partPaid ? values.balance_due : null,
    branding: t.planBranding,
  };
  return {
    to: t.customerEmail,
    replyTo: t.businessEmail,
    subject: subjectFor(t),
    react: createElement(t.entity === "quote" ? QuoteFollowupEmail : InvoiceReminderEmail, props),
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    unsubscribeUrl,
  };
}

export type DeliverIo = {
  appUrl: string;
  unsubscribeSecret: string | null;
  claim: (entity: "quote" | "invoice", id: string, kind: ReminderKind) => Promise<string | null>;
  finalize: (claimId: string, status: "sent" | "failed" | "skipped", reason: string | null, messageId: string | null) => Promise<boolean>;
  send: (input: { businessName: string; to: string; replyTo: string | null; subject: string; react: ReturnType<typeof createElement>; headers: Record<string, string> }) => Promise<SendResult>;
};

export type DeliverResult =
  | { outcome: "sent"; messageId: string }
  | { outcome: "claim_lost" }
  | { outcome: "failed"; reason: EmailFailure | "unsubscribe_secret_missing" | "no_recipient" }
  | { outcome: "skipped"; reason: "invalid_address" };

/**
 * Claim, send, finalize. The claim is exclusive: if it is not granted nothing is sent. The outcome is
 * recorded honestly: `sent` only when the mail server returned a message id. An invalid address is skipped for good.
 */
export async function deliverReminder(target: ReminderTarget, io: DeliverIo): Promise<DeliverResult> {
  if (!target.customerEmail) return { outcome: "failed", reason: "no_recipient" };
  if (!io.unsubscribeSecret) return { outcome: "failed", reason: "unsubscribe_secret_missing" };

  const claimId = await io.claim(target.entity, target.id, target.kind);
  if (!claimId) return { outcome: "claim_lost" };

  let result: SendResult;
  try {
    const message = buildReminderMessage(target, { appUrl: io.appUrl, unsubscribeSecret: io.unsubscribeSecret });
    result = await io.send({ businessName: target.businessName, to: message.to, replyTo: message.replyTo, subject: message.subject, react: message.react, headers: message.headers });
  } catch {
    result = { ok: false, reason: "failed" };
  }

  if (result.ok) {
    await io.finalize(claimId, "sent", null, result.id);
    return { outcome: "sent", messageId: result.id };
  }
  if (result.reason === "invalid_address") {
    await io.finalize(claimId, "skipped", "invalid_address", null);
    return { outcome: "skipped", reason: "invalid_address" };
  }
  await io.finalize(claimId, "failed", result.reason, null);
  return { outcome: "failed", reason: result.reason };
}
