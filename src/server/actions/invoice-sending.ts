"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import { formatDateOnly } from "@/lib/dates";
import { EMAIL_MESSAGES } from "@/lib/email-errors";
import { remainingCents } from "@/lib/invoice-calc";
import { canSend, getInvoiceSendProblems } from "@/lib/invoice-send";
import { formatMoney } from "@/lib/money";
import { REGIONS } from "@/lib/region";
import { buildPublicInvoiceUrl } from "@/lib/share-links";
import { logoPublicUrl } from "@/lib/supabase/storage";
import { generatePublicToken } from "@/lib/tokens";
import type { Ctx } from "@/server/customer-resolver";
import { isEmailConfigured, sendEmail } from "@/server/email/send";
import { InvoiceToCustomerEmail } from "@/server/email/templates/invoice-to-customer";
import { actionBusinessContext } from "./context";

const idSchema = z.uuid();
const CHANNELS = ["link", "email", "sms", "whatsapp"] as const;
export type InvoiceSendChannel = (typeof CHANNELS)[number];

export type SendInvoiceResult =
  | { ok: true; publicUrl: string; firstSend: boolean }
  | { ok: false; message: string; problems?: string[] };

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function revalidate(id: string) {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath(`/invoices/${id}/edit`);
}

async function loadInvoice(ctx: Ctx, invoiceId: string) {
  const { data } = await ctx.supabase
    .from("invoices")
    .select("*, customers(name, email, phone)")
    .eq("id", invoiceId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  return data;
}

async function logActivity(ctx: Ctx, invoiceId: string, event: string, meta: Record<string, string> = {}) {
  await ctx.supabase.from("activity").insert({
    business_id: ctx.business.id,
    entity_type: "invoice",
    entity_id: invoiceId,
    event,
    meta,
  });
}

/**
 * Send an invoice: re-validates on the server, then marks it sent with a fresh public
 * token. A resend (sent / viewed, including part-paid and overdue) keeps the existing token.
 */
export async function sendInvoice(invoiceId: string, options: { channel: InvoiceSendChannel }): Promise<SendInvoiceResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return { ok: false, message: ctx.error.message };
  if (!idSchema.safeParse(invoiceId).success || !CHANNELS.includes(options.channel)) {
    return { ok: false, message: "That invoice no longer exists." };
  }

  const invoice = await loadInvoice(ctx, invoiceId);
  if (!invoice) return { ok: false, message: "That invoice no longer exists." };
  if (!canSend(invoice.status)) {
    return { ok: false, message: invoice.status === "paid" ? "This invoice is already paid." : "A voided invoice can't be sent." };
  }

  const { data: items } = await ctx.supabase
    .from("invoice_items")
    .select("description, unit_rate_cents, needs_price")
    .eq("invoice_id", invoiceId)
    .order("position");

  const firstSend = invoice.status === "draft";
  const problems = getInvoiceSendProblems(items ?? [], invoice.customers, { issueDate: invoice.issue_date, dueDate: invoice.due_date });
  if (problems.length > 0) return { ok: false, message: "Fix these first, then send.", problems };

  let token = invoice.public_token;

  if (firstSend) {
    // The draft's placeholder token was never shared, so a fresh one is issued at first send.
    token = generatePublicToken();
    const { data: updated, error } = await ctx.supabase
      .from("invoices")
      .update({ status: "sent", sent_at: new Date().toISOString(), public_token: token })
      .eq("id", invoiceId)
      .eq("business_id", ctx.business.id)
      .eq("status", "draft")
      .select("id");
    if (error || !updated || updated.length === 0) {
      return { ok: false, message: error ? "We couldn't send the invoice. Try again." : "That invoice was already sent." };
    }
    await logActivity(ctx, invoiceId, "invoice.sent", { via: options.channel });
  } else {
    await logActivity(ctx, invoiceId, "invoice.resent", { via: options.channel });
  }

  revalidate(invoiceId);
  return { ok: true, publicUrl: buildPublicInvoiceUrl(appUrl(), token), firstSend };
}

/** Issue a new link. The old link stops working immediately. */
export async function regenerateInvoiceToken(invoiceId: string): Promise<ActionResult<{ publicUrl: string }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(invoiceId).success) return failure("That invoice no longer exists.");

  const token = generatePublicToken();
  const { data, error } = await ctx.supabase
    .from("invoices")
    .update({ public_token: token })
    .eq("id", invoiceId)
    .eq("business_id", ctx.business.id)
    .in("status", ["sent", "viewed", "paid"])
    .select("id");
  if (error) return failure("We couldn't make a new link. Try again.");
  if (!data || data.length === 0) return failure("Only sent invoices have a link.");

  await logActivity(ctx, invoiceId, "invoice.link_regenerated");
  revalidate(invoiceId);
  return { ok: true, publicUrl: buildPublicInvoiceUrl(appUrl(), token) };
}

/** Email the link to the customer (or to an address typed in the send sheet). Success only when the mail server accepted it. */
export async function sendInvoiceEmail(invoiceId: string, to?: string): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(invoiceId).success) return failure("That invoice no longer exists.");
  if (!isEmailConfigured()) return failure(EMAIL_MESSAGES.not_configured);

  const invoice = await loadInvoice(ctx, invoiceId);
  if (!invoice) return failure("That invoice no longer exists.");
  if (invoice.status !== "sent" && invoice.status !== "viewed") return failure("Send the invoice first, then email it.");

  const override = to?.trim();
  if (override && !z.email().safeParse(override).success) return failure("Enter a full email address, like name@example.com.");
  const recipient = override || invoice.customers?.email?.trim();
  if (!recipient) return failure("Add an email address for this customer first.");

  // Never email the same invoice twice within 60 seconds (double clicks, retries).
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: recent } = await ctx.supabase
    .from("activity")
    .select("id")
    .eq("business_id", ctx.business.id)
    .eq("entity_id", invoiceId)
    .eq("event", "invoice.emailed")
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) return failure("You just emailed this. Wait a minute before sending it again.");

  const { business } = ctx;
  const locale = REGIONS[business.country].locale;
  const money = (cents: number) => formatMoney(cents, invoice.currency, locale);
  const owed = remainingCents(invoice.total_cents, invoice.amount_paid_cents);

  const result = await sendEmail({
    businessName: business.name,
    to: recipient,
    replyTo: business.email,
    subject: `Invoice #${business.invoice_prefix}${invoice.number} from ${business.name}`,
    react: InvoiceToCustomerEmail({
      businessName: business.name,
      logoUrl: logoPublicUrl(business.logo_path),
      customerName: invoice.customers?.name ?? null,
      number: `${business.invoice_prefix}${invoice.number}`,
      totalText: money(invoice.total_cents),
      balanceDueText: invoice.amount_paid_cents > 0 ? money(owed) : null,
      dueDateText: formatDateOnly(invoice.due_date, locale),
      link: buildPublicInvoiceUrl(appUrl(), invoice.public_token),
      branding: business.plan === "trial" || business.plan === "free",
    }),
  });
  // Only a message Resend actually accepted counts as sent; the real reason is shown otherwise.
  if (!result.ok) return failure(EMAIL_MESSAGES[result.reason]);

  await logActivity(ctx, invoiceId, "invoice.emailed");
  revalidate(invoiceId);
  return { ok: true };
}

/** Record that the owner shared the link by SMS or WhatsApp (the message itself is sent from their phone). */
export async function logInvoiceShared(invoiceId: string, channel: "sms" | "whatsapp"): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(invoiceId).success || !["sms", "whatsapp"].includes(channel)) return failure("That invoice no longer exists.");

  const invoice = await loadInvoice(ctx, invoiceId);
  if (!invoice || invoice.status === "draft") return failure("Send the invoice first.");
  await logActivity(ctx, invoiceId, "invoice.shared", { via: channel });
  revalidate(invoiceId);
  return { ok: true };
}
