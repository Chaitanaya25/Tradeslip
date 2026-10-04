import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, MapPin } from "lucide-react";
import { z } from "zod";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { ReminderControl } from "@/components/reminders/reminder-control";
import { TotalsBlock } from "@/components/quotes/totals-block";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { requireBusiness } from "@/lib/auth/session";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import { daysOverdue, derivedStatus, remainingCents } from "@/lib/invoice-calc";
import { describeInvoiceActivity } from "@/lib/invoice-helpers";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payments";
import { todayInTimezone } from "@/lib/quote-calc";
import { reminderInfoText } from "@/lib/reminder-messages";
import { invoiceReminderInfo, settingsFromBusiness } from "@/lib/reminders";
import { REGIONS, quoteWord } from "@/lib/region";
import { buildPublicInvoiceUrl } from "@/lib/share-links";
import { logoPublicUrl } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Invoice · Tradeslip" };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const business = await requireBusiness();
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, customers(name, email, phone, address_line1, city, region, postcode), quotes(id, number)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!invoice) notFound();

  const [{ data: items }, { data: payments }, { data: activity }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
    supabase.from("invoice_payments").select("id, amount_cents, method, paid_on, note").eq("invoice_id", id).eq("business_id", business.id).order("paid_on").order("created_at"),
    supabase
      .from("activity")
      .select("id, event, meta, created_at")
      .eq("business_id", business.id)
      .eq("entity_type", "invoice")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const region = REGIONS[business.country];
  const locale = region.locale;
  const today = todayInTimezone(business.timezone);
  const money = (cents: number) => formatMoney(cents, invoice.currency, locale);
  const remaining = remainingCents(invoice.total_cents, invoice.amount_paid_cents);
  const status = derivedStatus(invoice.status, invoice.due_date, today, remaining, invoice.amount_paid_cents);
  const late = status === "overdue" ? daysOverdue(invoice.due_date, today) : 0;
  const c = invoice.customers;
  const logo = logoPublicUrl(business.logo_path);
  const label = `${business.invoice_prefix}${invoice.number}`;
  const businessAddress = [business.address_line1, business.city, business.region, business.postcode].filter(Boolean).join(", ");
  const customerAddress = [c?.address_line1, c?.city, c?.region, c?.postcode].filter(Boolean).join(", ");
  const word = quoteWord(business.country);

  const reminderInfo = invoiceReminderInfo(
    {
      status: invoice.status,
      dueDate: invoice.due_date,
      totalCents: invoice.total_cents,
      amountPaidCents: invoice.amount_paid_cents,
      reminderCount: invoice.reminder_count,
      lastReminderAt: invoice.last_reminder_at,
      customerEmail: c?.email ?? null,
    },
    business.timezone,
    settingsFromBusiness(business),
    business.plan,
  );

  const hasLink = invoice.status === "sent" || invoice.status === "viewed" || invoice.status === "paid";
  const publicUrl = hasLink ? buildPublicInvoiceUrl(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", invoice.public_token) : null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/invoices"
          aria-label="Back to invoices"
          className="flex size-10 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface-muted"
        >
          <ArrowLeft className="size-6" strokeWidth={1.5} />
        </Link>
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.01em]">Invoice #{label}</h1>
        <StatusPill status={status} />
        {late > 0 ? <span className="text-small text-text-muted">{late === 1 ? "1 day overdue" : `${late} days overdue`}</span> : null}
      </div>

      {invoice.status === "paid" ? (
        <div role="status" className="mb-6 flex gap-3 rounded-lg bg-status-good-bg p-4 text-status-good-text">
          <CircleCheck className="mt-0.5 size-6 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <div>
            <p className="text-[17px] font-semibold">Paid in full</p>
            <p className="text-[15px]">
              {invoice.paid_at ? `Paid on ${formatDateTime(invoice.paid_at, locale, business.timezone)}.` : "Paid."} Nothing more is owed.
            </p>
          </div>
        </div>
      ) : null}

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
            <p className="text-label text-text-muted">Invoice for</p>
            <p className="text-h2">{c?.name ?? "No customer"}</p>
            {customerAddress ? (
              <p className="text-body mt-1 flex items-center gap-1.5 text-text-muted">
                <MapPin className="size-4 shrink-0" strokeWidth={1.5} /> {customerAddress}
              </p>
            ) : null}
            <p className="text-small mt-1 text-text-muted">{[c?.phone, c?.email].filter(Boolean).join(" · ")}</p>
            {invoice.title ? <p className="text-body-strong mt-3">{invoice.title}</p> : null}
            <p className="text-small tabular text-text-muted">
              Issued {formatDateOnly(invoice.issue_date, locale)} · Due {formatDateOnly(invoice.due_date, locale)}
            </p>
            {invoice.quotes ? (
              <p className="text-small mt-1">
                <Link href={`/quotes/${invoice.quotes.id}`} className="font-medium text-accent hover:underline">
                  From {word.toLowerCase()} #{business.quote_prefix}
                  {invoice.quotes.number}
                </Link>
              </p>
            ) : null}
          </div>

          {(items ?? []).length === 0 ? (
            <p className="text-body text-text-muted">No items on this invoice.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {(items ?? []).map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-body">{item.description}</p>
                    <p className="tabular text-small text-text-muted">
                      {Number(item.qty)} × {money(item.unit_rate_cents)}
                    </p>
                  </div>
                  <p className="tabular text-body-strong shrink-0">{money(item.amount_cents)}</p>
                </li>
              ))}
            </ul>
          )}

          <TotalsBlock
            subtotalCents={invoice.subtotal_cents}
            taxCents={invoice.tax_cents}
            totalCents={invoice.total_cents}
            currency={invoice.currency}
            locale={locale}
            taxEnabled={invoice.tax_rate_bps > 0}
            taxLabel={business.tax_label}
            taxRateBps={invoice.tax_rate_bps}
          />

          {invoice.status !== "draft" && invoice.status !== "void" ? (
            <div className="space-y-1.5 border-t border-border pt-4 text-[16px]">
              <div className="flex justify-between text-text-muted">
                <span>Amount paid</span>
                <span className="tabular text-text">{money(invoice.amount_paid_cents)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-body-strong">Balance due</span>
                <span className={`tabular text-h2 font-bold ${remaining === 0 ? "text-status-good-text" : "text-accent"}`}>{money(remaining)}</span>
              </div>
            </div>
          ) : null}

          {invoice.notes ? (
            <div>
              <p className="text-label text-text-muted">Notes</p>
              <p className="text-body whitespace-pre-line">{invoice.notes}</p>
            </div>
          ) : null}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <InvoiceActions
            invoiceId={invoice.id}
            status={invoice.status}
            amountPaidCents={invoice.amount_paid_cents}
            remainingCents={remaining}
            label={label}
            publicUrl={publicUrl}
            customer={{ name: c?.name ?? null, email: c?.email ?? null, phone: c?.phone ?? null }}
            businessName={business.name}
            country={business.country}
            currency={invoice.currency}
            locale={locale}
            today={today}
          />

          {invoice.status !== "draft" && invoice.status !== "void" ? (
            <ReminderControl
              entity="invoice"
              id={invoice.id}
              infoText={reminderInfoText(reminderInfo, "invoice", locale)}
              canSend={status === "overdue" && invoice.reminder_count < 2 && Boolean(c?.email)}
              customerName={c?.name ?? null}
              label={`Invoice #${label}`}
            />
          ) : null}

          <Card>
            <h2 className="text-h2 mb-4">Payments</h2>
            {(payments ?? []).length === 0 ? (
              <p className="text-body text-text-muted">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(payments ?? []).map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-body">{PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}</p>
                      <p className="tabular text-small text-text-muted">
                        {formatDateOnly(p.paid_on, locale)}
                        {p.note ? ` · ${p.note}` : ""}
                      </p>
                    </div>
                    <p className="tabular text-body-strong shrink-0">{money(p.amount_cents)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

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
                      <p className="text-body">{describeInvoiceActivity(a.event, a.meta as Record<string, unknown> | null, money)}</p>
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
