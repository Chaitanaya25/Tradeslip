import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { z } from "zod";
import { CreateInvoiceButton } from "@/components/invoices/create-invoice-button";
import { ReminderControl } from "@/components/reminders/reminder-control";
import { QuoteActions } from "@/components/quotes/quote-actions";
import { ScheduleField } from "@/components/quotes/schedule-field";
import { TotalsBlock } from "@/components/quotes/totals-block";
import { Card } from "@/components/ui/card";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { requireBusiness } from "@/lib/auth/session";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatBpsAsPercent } from "@/lib/money-input";
import { effectivePlanOf, quoteSendLimit, quoteSendsRemaining, usagePeriod } from "@/lib/plans";
import { buildPublicUrl } from "@/lib/share-links";
import { utcToZonedParts } from "@/lib/schedule";
import { depositCents, todayInTimezone } from "@/lib/quote-calc";
import { describeActivity } from "@/lib/quote-helpers";
import { loadPhotos } from "@/lib/quote-queries";
import { reminderInfoText } from "@/lib/reminder-messages";
import { quoteReminderInfo, settingsFromBusiness } from "@/lib/reminders";
import { effectiveStatus } from "@/lib/quote-send";
import { REGIONS, quoteWord } from "@/lib/region";
import { logoPublicUrl } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Quote · Tradeslip" };

const KIND_LABELS = { before: "Before", after: "After", other: "Photo" } as const;

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const business = await requireBusiness();
  const supabase = await createClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, customers(name, email, phone, address_line1, city, region, postcode)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!quote) notFound();

  const [{ data: items }, { data: activity }, photos, { data: linkedInvoices }] = await Promise.all([
    supabase.from("quote_items").select("*").eq("quote_id", id).order("position"),
    supabase
      .from("activity")
      .select("id, event, meta, created_at")
      .eq("business_id", business.id)
      .eq("entity_type", "quote")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    loadPhotos(business.id, id),
    supabase.from("invoices").select("id, number").eq("quote_id", id).eq("business_id", business.id).neq("status", "void").limit(1),
  ]);
  const linkedInvoice = linkedInvoices?.[0] ?? null;

  const { data: counter } = await supabase
    .from("usage_counters")
    .select("quotes_sent")
    .eq("business_id", business.id)
    .eq("period", usagePeriod(business.timezone))
    .maybeSingle();
  const usedThisMonth = counter?.quotes_sent ?? 0;

  const region = REGIONS[business.country];
  const locale = region.locale;
  const word = quoteWord(business.country);
  const c = quote.customers;
  const logo = logoPublicUrl(business.logo_path);
  const statusLabel = quote.status.charAt(0).toUpperCase() + quote.status.slice(1);
  const businessAddress = [business.address_line1, business.city, business.region, business.postcode].filter(Boolean).join(", ");
  const customerAddress = [c?.address_line1, c?.city, c?.region, c?.postcode].filter(Boolean).join(", ");

  const reminderInfo = quoteReminderInfo(
    {
      status: quote.status,
      validUntil: quote.valid_until,
      sentAt: quote.sent_at,
      followupCount: quote.followup_count,
      lastFollowupAt: quote.last_followup_at,
      customerEmail: c?.email ?? null,
    },
    business.timezone,
    settingsFromBusiness(business),
    effectivePlanOf(business),
  );
  const awaitingReply = (quote.status === "sent" || quote.status === "viewed") && effectiveStatus(quote.status, quote.valid_until, todayInTimezone(business.timezone)) !== "expired";

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/quotes"
          aria-label="Back to quotes"
          className="flex size-10 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface-muted"
        >
          <ArrowLeft className="size-6" strokeWidth={1.5} />
        </Link>
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.01em]">
          {word} #{business.quote_prefix}
          {quote.number}
        </h1>
        <StatusPill status={quote.status as Status} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Card className="space-y-6 lg:col-span-3">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted text-[20px] font-semibold text-text-muted">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo from Supabase storage
                <img src={logo} alt={`${business.name} logo`} className="size-full object-contain" />
              ) : (
                <span aria-hidden="true">{business.name[0]?.toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-h2 truncate">{business.name}</p>
              <p className="text-small text-text-muted">{[business.phone, business.email].filter(Boolean).join(" · ")}</p>
              {businessAddress ? <p className="text-small text-text-muted">{businessAddress}</p> : null}
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-label text-text-muted">{word} for</p>
            <p className="text-h2">{c?.name ?? "No customer"}</p>
            {customerAddress ? (
              <p className="text-body mt-1 flex items-center gap-1.5 text-text-muted">
                <MapPin className="size-4 shrink-0" strokeWidth={1.5} /> {customerAddress}
              </p>
            ) : null}
            <p className="text-small mt-1 text-text-muted">{[c?.phone, c?.email].filter(Boolean).join(" · ")}</p>
            {quote.title ? <p className="text-body-strong mt-3">{quote.title}</p> : null}
            {quote.valid_until ? (
              <p className="text-small text-text-muted">Valid until {formatDateOnly(quote.valid_until, locale)}</p>
            ) : null}
          </div>

          {(items ?? []).length === 0 ? (
            <p className="text-body text-text-muted">No items on this {word.toLowerCase()}.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {(items ?? []).map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-body">{item.description}</p>
                    <p className="tabular text-small text-text-muted">
                      {Number(item.qty)} × {formatMoney(item.unit_rate_cents, quote.currency, locale)}
                    </p>
                  </div>
                  <p className="tabular text-body-strong shrink-0">{formatMoney(item.amount_cents, quote.currency, locale)}</p>
                </li>
              ))}
            </ul>
          )}

          <TotalsBlock
            subtotalCents={quote.subtotal_cents}
            taxCents={quote.tax_cents}
            totalCents={quote.total_cents}
            currency={quote.currency}
            locale={locale}
            taxEnabled={quote.tax_rate_bps > 0}
            taxLabel={business.tax_label}
            taxRateBps={quote.tax_rate_bps}
          />

          {quote.deposit_enabled ? (
            <div className="rounded-lg border border-accent-border bg-accent-soft p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-strong">Deposit ({formatBpsAsPercent(quote.deposit_bps)}%)</span>
                <span className="tabular text-h2 font-bold text-accent">
                  {formatMoney(depositCents(quote.total_cents, quote.deposit_bps), quote.currency, locale)}
                </span>
              </div>
              <p className="text-small text-text-muted">Due before the work starts.</p>
            </div>
          ) : null}

          {quote.notes ? (
            <div>
              <p className="text-label text-text-muted">Notes</p>
              <p className="text-body whitespace-pre-line">{quote.notes}</p>
            </div>
          ) : null}

          {photos.length > 0 ? (
            <div>
              <p className="text-label mb-2 text-text-muted">
                Job photos{quote.include_photos ? "" : " (not shown to the customer)"}
              </p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p, i) => (
                  <li key={p.id} className="overflow-hidden rounded-lg border border-border">
                    <div className="aspect-[4/3] bg-surface-muted">
                      {p.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                        <img src={p.url} alt={`${KIND_LABELS[p.kind]} ${i + 1}`} className="size-full object-cover" />
                      ) : null}
                    </div>
                    <p className="text-small px-2 py-1 text-text-muted">{KIND_LABELS[p.kind]}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {quote.status === "accepted" || quote.status === "declined" ? (
            <Card>
              <h2 className="text-h2 mb-2">{quote.status === "accepted" ? "Accepted" : "Declined"}</h2>
              {quote.status === "accepted" ? (
                <p className="text-body">
                  Accepted by <span className="text-body-strong">{quote.accepted_name}</span> on{" "}
                  {formatDateTime(quote.accepted_at, locale, business.timezone)} -{" "}
                  <span className={quote.accepted_verified ? "text-status-good-text" : "text-text-muted"}>
                    {quote.accepted_verified ? "verified by email" : "not verified"}
                  </span>
                  .
                </p>
              ) : (
                <p className="text-body">
                  Declined on {formatDateTime(quote.declined_at, locale, business.timezone)}.
                  {quote.decline_reason ? <span className="mt-1 block text-text-muted">Reason: {quote.decline_reason}</span> : null}
                </p>
              )}
            </Card>
          ) : null}

          {quote.status === "accepted" || linkedInvoice ? (
            <Card>
              <h2 className="text-h2 mb-2">Invoice</h2>
              {linkedInvoice ? (
                <p className="text-body mb-3">
                  Invoiced as{" "}
                  <Link href={`/invoices/${linkedInvoice.id}`} className="font-medium text-accent hover:underline">
                    #{business.invoice_prefix}
                    {linkedInvoice.number}
                  </Link>
                  .
                </p>
              ) : (
                <p className="text-body mb-3 text-text-muted">Accepted. Turn it into an invoice in one tap.</p>
              )}
              <CreateInvoiceButton quoteId={quote.id} word={word} existingInvoiceId={linkedInvoice?.id ?? null} className="w-full" />
            </Card>
          ) : null}

          {quote.status === "accepted" ? (
            <ScheduleField
              quoteId={quote.id}
              initial={quote.scheduled_for ? utcToZonedParts(quote.scheduled_for, business.timezone) : null}
              timezone={business.timezone}
            />
          ) : null}

          <QuoteActions
            quoteId={quote.id}
            status={quote.status}
            statusLabel={statusLabel}
            quoteWord={word}
            docPrefix={business.quote_prefix}
            publicUrl={quote.status === "draft" ? null : buildPublicUrl(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", quote.public_token)}
            customer={{ name: c?.name ?? null, email: c?.email ?? null, phone: c?.phone ?? null }}
            businessName={business.name}
            country={business.country}
            usage={{ limit: quoteSendLimit(effectivePlanOf(business)), remaining: quoteSendsRemaining(effectivePlanOf(business), usedThisMonth) }}
          />

          {awaitingReply ? (
            <ReminderControl
              entity="quote"
              id={quote.id}
              infoText={reminderInfoText(reminderInfo, "quote", locale)}
              canSend={quote.followup_count === 0 && Boolean(c?.email)}
              customerName={c?.name ?? null}
              label={`${word} #${business.quote_prefix}${quote.number}`}
            />
          ) : quote.followup_count > 0 ? (
            <ReminderControl entity="quote" id={quote.id} infoText={reminderInfoText(reminderInfo, "quote", locale)} canSend={false} customerName={c?.name ?? null} label="" />
          ) : null}

          <Card>
            <h2 className="text-h2 mb-4">Activity</h2>
            {(activity ?? []).length === 0 ? (
              <p className="text-body text-text-muted">Nothing has happened yet.</p>
            ) : (
              <ol className="space-y-4">
                {(activity ?? []).map((a, i, all) => (
                  <li key={a.id} className="relative flex gap-3">
                    <span className="relative mt-1.5 flex flex-col items-center">
                      <span className={`size-2.5 rounded-full ${i === 0 ? "bg-accent" : "bg-border-strong"}`} />
                      {i < all.length - 1 ? <span className="absolute top-4 h-[calc(100%+0.5rem)] w-px bg-border" /> : null}
                    </span>
                    <div>
                      <p className="text-body">
                        {describeActivity(a.event, a.meta as Record<string, unknown> | null, word)}
                      </p>
                      <p className="text-small tabular text-text-muted">{formatDateTime(a.created_at, locale, business.timezone)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
