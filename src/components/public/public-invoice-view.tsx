import { CircleCheck, FileDown, MapPin } from "lucide-react";
import { PublicDocHeader, PublicItemsList, PublicTotals } from "@/components/public/document-parts";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { isVoidInvoice, type PublicInvoiceResult } from "@/lib/public-invoice";
import { formatCustomerAddress } from "@/lib/public-quote";
import { REGIONS } from "@/lib/region";
import { mailtoLink } from "@/lib/share-links";

function longDate(timestamp: string | null, locale: string, timeZone: string): string {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short", year: "numeric" }).format(new Date(timestamp));
}

type Business = { name: string; phone: string | null; email: string | null };

/** "Call" and "Email" buttons so the customer can reach the business when there is no payment link. */
function ContactButtons({ business }: { business: Business }) {
  const mail = mailtoLink(business.email, "Question about my invoice", `Hi ${business.name}, I have a question about my invoice.`);
  return (
    <div className="space-y-3">
      {business.phone ? (
        <Button asChild className="h-[52px] w-full text-[17px]">
          <a href={`tel:${business.phone.replace(/[^\d+]/g, "")}`}>Call {business.name}</a>
        </Button>
      ) : null}
      {mail ? (
        <Button asChild variant="secondary" className="h-[52px] w-full text-[17px]">
          <a href={mail}>Email {business.name}</a>
        </Button>
      ) : null}
    </div>
  );
}

/** The customer's page for an invoice: mobile first, one 480px column, server-rendered, no client JS. */
export function PublicInvoiceView({ token, data }: { token: string; data: PublicInvoiceResult }) {
  const { business } = data;
  const region = REGIONS[business.country];
  const locale = region.locale;
  const footer = business.plan_branding ? (
    <footer className="mt-8 border-t border-border pt-5 text-center text-[14px] text-text-muted">
      Sent with <span className="font-semibold">Tradeslip</span>
    </footer>
  ) : null;

  if (isVoidInvoice(data)) {
    return (
      <main className="mx-auto w-full max-w-[480px] px-5 pt-6 pb-10 text-[17px] leading-6">
        <PublicDocHeader name={business.name} logoPath={business.logo_path} subline={business.phone ?? ""} />
        <section className="space-y-4 py-6">
          <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em]">
            Invoice #{data.invoice.number_prefix}
            {data.invoice.number}
          </h1>
          <p role="status" className="rounded-lg bg-surface-muted p-4 text-[15px] text-text-muted">
            This invoice has been cancelled, so nothing is owed on it. Contact {business.name} if you have a question.
          </p>
          <ContactButtons business={business} />
        </section>
        {footer}
      </main>
    );
  }

  const { invoice, customer, business: biz } = data;
  const money = (cents: number) => formatMoney(cents, invoice.currency, locale);
  const number = `${invoice.number_prefix}${invoice.number}`;
  const address = formatCustomerAddress(customer);
  const paid = invoice.status === "paid";
  const owing = invoice.remaining_cents > 0 && !paid;
  const payUrl = biz.payment_link_url;

  return (
    <main className="mx-auto w-full max-w-[480px] px-5 pt-6 pb-10 text-[17px] leading-6">
      <PublicDocHeader
        name={business.name}
        logoPath={business.logo_path}
        subline={[biz.tax_number ? "Licensed & insured" : null, business.phone].filter(Boolean).join(" · ")}
      />

      <section className="border-b border-border py-5">
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em]">Invoice for {customer.name ?? "you"}</h1>
        <p className="tabular text-[15px] text-text-muted">
          #{number} · Due {formatDateOnly(invoice.due_date, locale)}
        </p>
        {invoice.title ? <p className="mt-3 text-[17px] font-medium">{invoice.title}</p> : null}
        {address ? (
          <div className="mt-4 flex gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
            <div>
              <p className="text-[13px] leading-[18px] text-text-muted">Address</p>
              <p className="text-[16px]">{address}</p>
            </div>
          </div>
        ) : null}
      </section>

      <PublicItemsList items={data.items} currency={invoice.currency} locale={locale} />

      <PublicTotals
        subtotalCents={invoice.subtotal_cents}
        taxCents={invoice.tax_cents}
        totalCents={invoice.total_cents}
        taxRateBps={invoice.tax_rate_bps}
        taxLabel={biz.tax_label}
        currency={invoice.currency}
        locale={locale}
      />

      {invoice.amount_paid_cents > 0 ? (
        <section className="space-y-1.5 border-t border-border py-4 text-[16px]">
          <div className="flex justify-between text-text-muted">
            <span>Amount paid</span>
            <span className="tabular text-text">{money(invoice.amount_paid_cents)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[18px] font-semibold">Balance due</span>
            <span className="tabular text-[22px] font-bold text-accent">{money(invoice.remaining_cents)}</span>
          </div>
        </section>
      ) : null}

      {invoice.notes ? (
        <section className="mt-5 border-t border-border pt-5">
          <h2 className="text-[18px] leading-7 font-semibold">Notes</h2>
          <p className="mt-1 text-[16px] whitespace-pre-line">{invoice.notes}</p>
        </section>
      ) : null}

      <section className="mt-6 space-y-3 border-t border-border pt-6">
        {paid ? (
          <div role="status" className="flex gap-3 rounded-lg bg-status-good-bg p-4 text-status-good-text">
            <CircleCheck className="mt-0.5 size-6 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <div>
              <p className="text-[17px] font-semibold">This invoice has been paid</p>
              <p className="text-[15px]">
                {invoice.paid_at ? `Paid on ${longDate(invoice.paid_at, locale, business.timezone)}. ` : ""}Thank you.
              </p>
            </div>
          </div>
        ) : null}

        {owing && invoice.status === "overdue" ? (
          <p role="status" className="rounded-lg bg-surface-muted p-4 text-[15px] text-text-muted">
            This invoice is overdue. If you have already paid, thank you, and please ignore this.
          </p>
        ) : null}

        {owing && payUrl ? (
          <Button asChild className="h-[52px] w-full text-[17px]">
            <a href={payUrl} target="_blank" rel="noopener noreferrer">
              Pay now {money(invoice.remaining_cents)}
            </a>
          </Button>
        ) : null}

        {owing && !payUrl ? (
          <>
            <p className="text-[15px] text-text-muted">Contact {business.name} to arrange payment.</p>
            <ContactButtons business={business} />
          </>
        ) : null}

        {owing ? <p className="text-[14px] leading-5 text-text-muted">Payments are handled by {business.name}.</p> : null}

        <Button asChild variant="secondary" className="h-[52px] w-full text-[17px] text-text-muted">
          <a href={`/i/${token}/pdf`} target="_blank" rel="noopener noreferrer">
            <FileDown /> Download PDF
          </a>
        </Button>
      </section>

      {footer}
    </main>
  );
}
