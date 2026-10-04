"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { quoteLimitMessage, quoteSendLimit, quoteSendsRemaining, usagePeriod } from "@/lib/plans";
import { todayInTimezone } from "@/lib/quote-calc";
import { canSend, getSendProblems, type SendableStatus } from "@/lib/quote-send";
import { REGIONS, quoteWord } from "@/lib/region";
import { buildPublicUrl } from "@/lib/share-links";
import { logoPublicUrl } from "@/lib/supabase/storage";
import { generatePublicToken } from "@/lib/tokens";
import { EMAIL_MESSAGES } from "@/lib/email-errors";
import { sendEmail, isEmailConfigured } from "@/server/email/send";
import { QuoteToCustomerEmail } from "@/server/email/templates/quote-to-customer";
import { refundQuoteSend, reserveQuoteSend } from "@/server/quote-usage";
import { actionBusinessContext } from "./context";

type Ctx = Extract<Awaited<ReturnType<typeof actionBusinessContext>>, { ok: true }>;

const idSchema = z.uuid();
const CHANNELS = ["link", "email", "sms", "whatsapp"] as const;
export type SendChannel = (typeof CHANNELS)[number];

export type SendUsage = { limit: number | null; remaining: number | null };

export type SendQuoteResult =
  | { ok: true; publicUrl: string; firstSend: boolean; usage: SendUsage }
  | { ok: false; message: string; problems?: string[] };

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function revalidate(id: string) {
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  revalidatePath(`/quotes/${id}/edit`);
}

async function loadQuote(ctx: Ctx, quoteId: string) {
  const { data: quote } = await ctx.supabase
    .from("quotes")
    .select("*, customers(name, email, phone)")
    .eq("id", quoteId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  return quote;
}

async function currentUsage(ctx: Ctx): Promise<SendUsage> {
  const limit = quoteSendLimit(ctx.business.plan);
  if (limit === null) return { limit: null, remaining: null };
  const { data } = await ctx.supabase
    .from("usage_counters")
    .select("quotes_sent")
    .eq("business_id", ctx.business.id)
    .eq("period", usagePeriod(ctx.business.timezone))
    .maybeSingle();
  return { limit, remaining: quoteSendsRemaining(ctx.business.plan, data?.quotes_sent ?? 0) };
}

async function logActivity(ctx: Ctx, quoteId: string, event: string, meta: Record<string, string> = {}) {
  await ctx.supabase.from("activity").insert({
    business_id: ctx.business.id,
    entity_type: "quote",
    entity_id: quoteId,
    event,
    meta,
  });
}

/**
 * Send a quote: re-validates on the server, enforces the free-plan limit on the first
 * send, then marks it sent with a fresh public token. A resend keeps the existing token.
 */
export async function sendQuote(quoteId: string, options: { channel: SendChannel }): Promise<SendQuoteResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return { ok: false, message: ctx.error.message };
  if (!idSchema.safeParse(quoteId).success || !CHANNELS.includes(options.channel)) {
    return { ok: false, message: "That quote no longer exists." };
  }

  const quote = await loadQuote(ctx, quoteId);
  if (!quote) return { ok: false, message: "That quote no longer exists." };
  const status = quote.status as SendableStatus;
  const word = quoteWord(ctx.business.country);
  if (!canSend(status)) return { ok: false, message: `This ${word.toLowerCase()} has already been ${status}, so it can't be sent again.` };

  const { data: items } = await ctx.supabase
    .from("quote_items")
    .select("description, unit_rate_cents, needs_price")
    .eq("quote_id", quoteId)
    .order("position");

  const firstSend = status === "draft";
  const problems = getSendProblems(items ?? [], quote.customers, firstSend ? { validUntil: quote.valid_until, today: todayInTimezone(ctx.business.timezone) } : undefined);
  if (problems.length > 0) return { ok: false, message: "Fix these first, then send.", problems };

  let token = quote.public_token;

  if (firstSend) {
    const limit = quoteSendLimit(ctx.business.plan);
    const period = usagePeriod(ctx.business.timezone);
    if (limit !== null) {
      const reservation = await reserveQuoteSend(ctx.business.id, period, limit);
      if (reservation.error) return { ok: false, message: "We couldn't check your plan just now. Try again." };
      if (!reservation.ok) return { ok: false, message: quoteLimitMessage(word) };
    }

    // The draft's placeholder token was never shared, so a fresh one is issued at first send.
    token = generatePublicToken();
    const { data: updated, error } = await ctx.supabase
      .from("quotes")
      .update({ status: "sent", sent_at: new Date().toISOString(), public_token: token })
      .eq("id", quoteId)
      .eq("business_id", ctx.business.id)
      .eq("status", "draft")
      .select("id");

    if (error || !updated || updated.length === 0) {
      if (limit !== null) await refundQuoteSend(ctx.business.id, period);
      return { ok: false, message: error ? "We couldn't send the quote. Try again." : "That quote was already sent." };
    }
    await logActivity(ctx, quoteId, "quote.sent", { via: options.channel });
  } else {
    await logActivity(ctx, quoteId, "quote.resent", { via: options.channel });
  }

  revalidate(quoteId);
  return { ok: true, publicUrl: buildPublicUrl(appUrl(), token), firstSend, usage: await currentUsage(ctx) };
}

/** Issue a new link. The old link stops working immediately. */
export async function regeneratePublicToken(quoteId: string): Promise<ActionResult<{ publicUrl: string }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(quoteId).success) return failure("That quote no longer exists.");

  const token = generatePublicToken();
  const { data, error } = await ctx.supabase
    .from("quotes")
    .update({ public_token: token })
    .eq("id", quoteId)
    .eq("business_id", ctx.business.id)
    .neq("status", "draft")
    .select("id");
  if (error) return failure("We couldn't make a new link. Try again.");
  if (!data || data.length === 0) return failure("Only sent quotes have a link.");

  await logActivity(ctx, quoteId, "quote.link_regenerated");
  revalidate(quoteId);
  return { ok: true, publicUrl: buildPublicUrl(appUrl(), token) };
}

/** Email the link to the customer (or to an address typed in the send sheet). */
export async function sendQuoteEmail(quoteId: string, to?: string): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(quoteId).success) return failure("That quote no longer exists.");
  if (!isEmailConfigured()) return failure(EMAIL_MESSAGES.not_configured);

  const quote = await loadQuote(ctx, quoteId);
  if (!quote) return failure("That quote no longer exists.");
  if (quote.status !== "sent" && quote.status !== "viewed") return failure("Send the quote first, then email it.");

  const override = to?.trim();
  if (override && !z.email().safeParse(override).success) return failure("Enter a full email address, like name@example.com.");
  const recipient = override || quote.customers?.email?.trim();
  if (!recipient) return failure("Add an email address for this customer first.");

  // Never email the same quote twice within 60 seconds (double clicks, retries).
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: recent } = await ctx.supabase
    .from("activity")
    .select("id")
    .eq("business_id", ctx.business.id)
    .eq("entity_id", quoteId)
    .eq("event", "quote.emailed")
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length > 0) return failure("You just emailed this. Wait a minute before sending it again.");

  const { business } = ctx;
  const locale = REGIONS[business.country].locale;
  const result = await sendEmail({
    businessName: business.name,
    to: recipient,
    replyTo: business.email,
    subject: `${quoteWord(business.country)} #${business.quote_prefix}${quote.number} from ${business.name}`,
    react: QuoteToCustomerEmail({
      businessName: business.name,
      logoUrl: logoPublicUrl(business.logo_path),
      customerName: quote.customers?.name ?? null,
      quoteWord: quoteWord(business.country),
      number: `${business.quote_prefix}${quote.number}`,
      totalText: formatMoney(quote.total_cents, quote.currency, locale),
      validUntilText: quote.valid_until ? formatDateOnly(quote.valid_until, locale) : null,
      link: buildPublicUrl(appUrl(), quote.public_token),
      branding: business.plan === "trial" || business.plan === "free",
    }),
  });
  // Only a message Resend actually accepted counts as sent; the real reason is shown otherwise.
  if (!result.ok) return failure(EMAIL_MESSAGES[result.reason]);

  await logActivity(ctx, quoteId, "quote.emailed");
  revalidate(quoteId);
  return { ok: true };
}

/** Record that the owner shared the link by SMS or WhatsApp (the message itself is sent from their phone). */
export async function logQuoteShared(quoteId: string, channel: "sms" | "whatsapp"): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(quoteId).success || !["sms", "whatsapp"].includes(channel)) return failure("That quote no longer exists.");

  const quote = await loadQuote(ctx, quoteId);
  if (!quote || quote.status === "draft") return failure("Send the quote first.");
  await logActivity(ctx, quoteId, "quote.shared", { via: channel });
  revalidate(quoteId);
  return { ok: true };
}
