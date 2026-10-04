import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, MessageCircle, MessageSquare, Phone, Plus } from "lucide-react";
import { z } from "zod";
import { CustomerActions } from "@/components/customers/customer-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { describeAnyActivity } from "@/lib/activity";
import { requireBusiness } from "@/lib/auth/session";
import { summariseCustomer } from "@/lib/customer-stats";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import { derivedStatus, remainingCents, type StoredInvoiceStatus } from "@/lib/invoice-calc";
import { formatMoney } from "@/lib/money";
import { todayInTimezone } from "@/lib/quote-calc";
import { effectiveStatus } from "@/lib/quote-send";
import { REGIONS, quoteWord } from "@/lib/region";
import { mailtoLink, normalizePhoneDigits, smsLink, whatsappLink } from "@/lib/share-links";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Customer · Tradeslip" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const business = await requireBusiness();
  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (!customer) notFound();

  const [{ data: quotes }, { data: invoices }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, number, title, status, total_cents, valid_until, sent_at, updated_at")
      .eq("business_id", business.id)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("invoices")
      .select("id, number, title, status, total_cents, amount_paid_cents, due_date, paid_at, updated_at")
      .eq("business_id", business.id)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const quoteRows = quotes ?? [];
  const invoiceRows = invoices ?? [];
  const entityIds = [id, ...quoteRows.map((q) => q.id), ...invoiceRows.map((i) => i.id)];
  const { data: activity } = await supabase
    .from("activity")
    .select("id, entity_id, entity_type, event, meta, created_at")
    .eq("business_id", business.id)
    .in("entity_id", entityIds)
    .order("created_at", { ascending: false })
    .limit(40);

  const region = REGIONS[business.country];
  const locale = region.locale;
  const word = quoteWord(business.country);
  const today = todayInTimezone(business.timezone);
  const money = (cents: number) => formatMoney(cents, business.currency, locale);

  const summary = summariseCustomer({
    today,
    quotes: quoteRows.map((q) => ({ status: q.status, updatedAt: q.updated_at, sentAt: q.sent_at })),
    invoices: invoiceRows.map((i) => ({
      status: i.status as StoredInvoiceStatus,
      dueDate: i.due_date,
      totalCents: i.total_cents,
      amountPaidCents: i.amount_paid_cents,
      updatedAt: i.updated_at,
      paidAt: i.paid_at,
    })),
  });

  const labelFor = new Map<string, string>([
    ...quoteRows.map((q) => [q.id, `${word} #${business.quote_prefix}${q.number}`] as const),
    ...invoiceRows.map((i) => [i.id, `Invoice #${business.invoice_prefix}${i.number}`] as const),
  ]);

  const phoneDigits = normalizePhoneDigits(customer.phone, business.country);
  const address = [customer.address_line1, customer.city, customer.region, customer.postcode].filter(Boolean).join(", ");
  const contacts = [
    customer.phone ? { href: `tel:${customer.phone.replace(/[^\d+]/g, "")}`, label: "Call", icon: Phone, external: false } : null,
    customer.email ? { href: mailtoLink(customer.email, "", "") ?? "", label: "Email", icon: Mail, external: false } : null,
    phoneDigits ? { href: smsLink(phoneDigits, "") ?? "", label: "Text", icon: MessageSquare, external: false } : null,
    phoneDigits ? { href: whatsappLink(phoneDigits, "") ?? "", label: "WhatsApp", icon: MessageCircle, external: true } : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null && c.href !== "");

  const stats = [
    { label: "Total paid", value: money(summary.totalPaidCents), tone: "" },
    { label: "Outstanding", value: money(summary.outstandingCents), tone: summary.outstandingCents > 0 ? "text-accent" : "" },
    { label: `${word}s`, value: String(summary.quoteCount), tone: "" },
    { label: "Invoices", value: String(summary.invoiceCount), tone: "" },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/customers" aria-label="Back to customers" className="flex size-10 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface-muted">
          <ArrowLeft className="size-6" strokeWidth={1.5} />
        </Link>
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.01em]">{customer.name}</h1>
        {customer.archived ? <span className="text-small rounded-md bg-surface-muted px-2 py-0.5 text-text-muted">Archived</span> : null}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card className="space-y-4">
            <div>
              {address ? (
                <p className="text-body flex items-center gap-1.5 text-text-muted">
                  <MapPin className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" /> {address}
                </p>
              ) : null}
              <p className="text-small mt-1 text-text-muted">{[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details yet."}</p>
            </div>
            {contacts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {contacts.map((c) => (
                  <Button key={c.label} asChild variant="secondary" size="compact">
                    <a href={c.href} {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                      <c.icon /> {c.label}
                    </a>
                  </Button>
                ))}
              </div>
            ) : null}
            {customer.notes ? (
              <div className="border-t border-border pt-4">
                <p className="text-label text-text-muted">Notes</p>
                <p className="text-body whitespace-pre-line">{customer.notes}</p>
              </div>
            ) : null}
          </Card>

          <section aria-label="Summary" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => (
              <Card key={s.label} className="p-4">
                <p className="text-small text-text-muted">{s.label}</p>
                <p className={`tabular text-h2 ${s.tone}`}>{s.value}</p>
              </Card>
            ))}
          </section>

          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-h2">{word}s</h2>
              {customer.archived ? null : (
                <Button asChild variant="outline-accent">
                  <Link href={`/quotes/new?customerId=${customer.id}`}>
                    <Plus /> New {word.toLowerCase()}
                  </Link>
                </Button>
              )}
            </div>
            {quoteRows.length === 0 ? (
              <p className="text-body text-text-muted">No {word.toLowerCase()}s yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {quoteRows.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/quotes/${q.id}`} className="text-body-strong rounded-md hover:underline">
                        {q.title || `${word} #${business.quote_prefix}${q.number}`}
                      </Link>
                      <p className="text-small text-text-muted">
                        #{business.quote_prefix}
                        {q.number}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tabular text-body">{money(q.total_cents)}</span>
                      <StatusPill status={effectiveStatus(q.status, q.valid_until, today) as Status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-h2">Invoices</h2>
              {customer.archived ? null : (
                <Button asChild variant="outline-accent">
                  <Link href={`/invoices/new?customerId=${customer.id}`}>
                    <Plus /> New invoice
                  </Link>
                </Button>
              )}
            </div>
            {invoiceRows.length === 0 ? (
              <p className="text-body text-text-muted">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {invoiceRows.map((i) => {
                  const remaining = remainingCents(i.total_cents, i.amount_paid_cents);
                  const status = derivedStatus(i.status as StoredInvoiceStatus, i.due_date, today, remaining, i.amount_paid_cents);
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link href={`/invoices/${i.id}`} className="text-body-strong rounded-md hover:underline">
                          {i.title || `Invoice #${business.invoice_prefix}${i.number}`}
                        </Link>
                        <p className="text-small text-text-muted">
                          #{business.invoice_prefix}
                          {i.number}
                          {i.status !== "draft" ? ` · Due ${formatDateOnly(i.due_date, locale)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-right">
                        <span className="tabular text-body">
                          {money(i.total_cents)}
                          {i.amount_paid_cents > 0 && remaining > 0 ? <span className="text-small block text-text-muted">{money(remaining)} remaining</span> : null}
                        </span>
                        <StatusPill status={status as Status} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="text-h2 mb-4">Manage</h2>
            <CustomerActions customerId={customer.id} archived={customer.archived} hasHistory={quoteRows.length > 0 || invoiceRows.length > 0} />
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
                      <p className="text-body">
                        {describeAnyActivity(a.event, a.meta as Record<string, unknown> | null, {
                          quoteWord: word,
                          money,
                          subject: a.entity_type === "customer" ? null : (labelFor.get(a.entity_id) ?? null),
                        })}
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
