import { CircleCheck, MapPin } from "lucide-react";
import { PublicDocHeader, PublicItemsList, PublicTotals } from "@/components/public/document-parts";
import { QuoteResponse } from "@/components/public/quote-response";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatBpsAsPercent } from "@/lib/money-input";
import { depositCents } from "@/lib/quote-calc";
import { formatCustomerAddress, type PublicQuote } from "@/lib/public-quote";
import { REGIONS, quoteWord } from "@/lib/region";
import { mailtoLink, normalizePhoneDigits, smsLink } from "@/lib/share-links";

type SignedPhoto = { url: string; kind: "before" | "after" | "other" };

const KIND_LABEL = { before: "Before", after: "After", other: "Photo" } as const;

function longDate(timestamp: string | null, locale: string, timeZone: string): string {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short", year: "numeric" }).format(new Date(timestamp));
}

/** The customer's page for a quote: mobile first, one 480px column. Server-rendered; only the buttons are client JS. */
export function PublicQuoteView({
  token,
  data,
  photos,
  maskedEmail,
  isOwner,
}: {
  token: string;
  data: PublicQuote;
  photos: SignedPhoto[];
  /** Masked address the acceptance code goes to (e.g. j***@gmail.com), or null when none is on file. */
  maskedEmail: string | null;
  /** The signed-in owner is looking at their own link. */
  isOwner: boolean;
}) {
  const { quote, business, customer } = data;
  const region = REGIONS[business.country];
  const locale = region.locale;
  const word = quoteWord(business.country);
  const wordLower = word.toLowerCase();
  const money = (cents: number) => formatMoney(cents, quote.currency, locale);
  const number = `${quote.number_prefix}${quote.number}`;
  const address = formatCustomerAddress(customer);
  const deposit = quote.deposit_enabled ? depositCents(quote.total_cents, quote.deposit_bps) : null;

  // "Ask a question": email if the business has one, otherwise a text message.
  const message = `Hi ${business.name}, I have a question about ${wordLower} #${number}.`;
  const subject = `Question about ${wordLower} #${number}`;
  const phoneDigits = normalizePhoneDigits(business.phone, business.country);
  const askHref = mailtoLink(business.email, subject, message) ?? smsLink(phoneDigits, message);

  const status = quote.status;
  const open = status === "sent" || status === "viewed";
  const payUrl = quote.deposit_enabled ? business.payment_link_url : null;

  return (
    <main className="mx-auto w-full max-w-[480px] px-5 pt-6 pb-10 text-[17px] leading-6">
      <PublicDocHeader
        name={business.name}
        logoPath={business.logo_path}
        subline={[business.tax_number ? "Licensed & insured" : null, business.phone].filter(Boolean).join(" · ")}
      />

      <section className="border-b border-border py-5">
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em]">
          {word} for {customer.name ?? "you"}
        </h1>
        <p className="tabular text-[15px] text-text-muted">
          #{number}
          {quote.valid_until ? ` · Valid until ${formatDateOnly(quote.valid_until, locale)}` : ""}
        </p>
        {quote.title ? <p className="mt-3 text-[17px] font-medium">{quote.title}</p> : null}
        {address ? (
          <div className="mt-4 flex gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
            <div>
              <p className="text-[13px] leading-[18px] text-text-muted">Job address</p>
              <p className="text-[16px]">{address}</p>
            </div>
          </div>
        ) : null}
      </section>

      <PublicItemsList items={data.items} currency={quote.currency} locale={locale} />

      <PublicTotals
        subtotalCents={quote.subtotal_cents}
        taxCents={quote.tax_cents}
        totalCents={quote.total_cents}
        taxRateBps={quote.tax_rate_bps}
        taxLabel={business.tax_label}
        currency={quote.currency}
        locale={locale}
      />

      {deposit !== null ? (
        <section className="rounded-lg border border-accent-border bg-accent-soft p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[16px] font-medium">{formatBpsAsPercent(quote.deposit_bps)}% deposit due on acceptance:</span>
            <span className="tabular text-[20px] font-bold text-accent">{money(deposit)}</span>
          </div>
          <p className="mt-1 text-[14px] leading-5 text-text-muted">
            The remaining balance of {money(quote.total_cents - deposit)} is due on completion.
          </p>
        </section>
      ) : null}

      {quote.notes ? (
        <section className="mt-5 border-t border-border pt-5">
          <h2 className="text-[18px] leading-7 font-semibold">Notes</h2>
          <p className="mt-1 text-[16px] whitespace-pre-line">{quote.notes}</p>
        </section>
      ) : null}

      {photos.length > 0 ? (
        <section className="mt-5 border-t border-border pt-5" aria-label="Job photos">
          <h2 className="text-[18px] leading-7 font-semibold">Photos</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {photos.map((p, i) => (
              <li key={i}>
                <div className="aspect-[4/3] overflow-hidden rounded-lg bg-surface-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                  <img src={p.url} alt={`${KIND_LABEL[p.kind]} photo ${i + 1}`} width={400} height={300} loading="lazy" className="size-full object-cover" />
                </div>
                <p className="mt-1 text-[13px] text-text-muted">{KIND_LABEL[p.kind]}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 border-t border-border pt-6">
        {status === "accepted" ? (
          <div className="space-y-3">
            <div role="status" className="flex gap-3 rounded-lg bg-status-good-bg p-4 text-status-good-text">
              <CircleCheck className="mt-0.5 size-6 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <div>
                <p className="text-[17px] font-semibold">
                  You accepted this {wordLower}
                </p>
                <p className="text-[15px]">
                  {quote.accepted_name ? `${quote.accepted_name}, on ` : "On "}
                  {longDate(quote.accepted_at, locale, business.timezone)}. {business.name} has been told.
                </p>
              </div>
            </div>
            {payUrl && deposit !== null ? (
              <Button asChild className="h-[52px] w-full text-[17px]">
                <a href={payUrl} target="_blank" rel="noopener noreferrer">
                  Pay deposit {money(deposit)}
                </a>
              </Button>
            ) : null}
            {askHref ? (
              <Button asChild variant="secondary" className="h-[52px] w-full text-[17px] text-text-muted">
                <a href={askHref}>Ask a question</a>
              </Button>
            ) : null}
          </div>
        ) : null}

        {status === "declined" ? (
          <div className="space-y-3">
            <p role="status" className="rounded-lg bg-surface-muted p-4 text-[15px] text-text-muted">
              This {wordLower} was declined on {longDate(quote.declined_at, locale, business.timezone)}.
            </p>
            {askHref ? (
              <Button asChild variant="secondary" className="h-[52px] w-full text-[17px] text-text-muted">
                <a href={askHref}>Ask a question</a>
              </Button>
            ) : null}
          </div>
        ) : null}

        {status === "expired" ? (
          <div className="space-y-3">
            <p role="status" className="rounded-lg bg-status-warn-bg p-4 text-[15px] text-status-warn-text">
              This {wordLower} has expired. Contact {business.name} for an updated one.
            </p>
            {business.phone ? (
              <Button asChild className="h-[52px] w-full text-[17px]">
                <a href={`tel:${business.phone.replace(/[^\d+]/g, "")}`}>Call {business.name}</a>
              </Button>
            ) : null}
            {askHref ? (
              <Button asChild variant="secondary" className="h-[52px] w-full text-[17px] text-text-muted">
                <a href={askHref}>Ask a question</a>
              </Button>
            ) : null}
          </div>
        ) : null}

        {open ? (
          <div className="space-y-3">
            {isOwner ? (
              <p role="status" className="rounded-lg bg-surface-muted p-4 text-[15px] leading-6 text-text-muted">
                You are viewing this as the owner. Customers see the Accept button here.
              </p>
            ) : null}
            <QuoteResponse token={token} word={wordLower} askHref={askHref} maskedEmail={quote.requires_verification ? maskedEmail : null} ownerPreview={isOwner} />
          </div>
        ) : null}
      </section>

      {business.plan_branding ? (
        <footer className="mt-8 border-t border-border pt-5 text-center text-[14px] text-text-muted">
          Sent with <span className="font-semibold">Tradeslip</span>
        </footer>
      ) : null}
    </main>
  );
}
