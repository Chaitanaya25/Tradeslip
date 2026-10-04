import { formatBpsAsPercent } from "@/lib/money-input";
import { formatMoney } from "@/lib/money";
import { monogramFor } from "@/lib/quote-document";
import { logoPublicUrl } from "@/lib/supabase/storage";

/** Pieces the public quote and public invoice pages share (server components, no JS). */

export function PublicDocHeader({ name, logoPath, subline }: { name: string; logoPath: string | null; subline: string }) {
  const logoUrl = logoPublicUrl(logoPath);
  return (
    <header className="flex items-center gap-4 border-b border-border pb-5">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted text-[19px] font-semibold text-text-muted">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- business logo from public storage
          <img src={logoUrl} alt={`${name} logo`} width={56} height={56} className="size-full object-cover" />
        ) : (
          <span aria-hidden="true">{monogramFor(name)}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[20px] leading-7 font-semibold">{name}</p>
        <p className="text-[15px] text-text-muted">{subline}</p>
      </div>
    </header>
  );
}

type Item = { description: string; qty: number; unit_rate_cents: number; amount_cents: number; position: number };

export function PublicItemsList({ items, currency, locale }: { items: readonly Item[]; currency: string; locale: string }) {
  const money = (cents: number) => formatMoney(cents, currency, locale);
  return (
    <section className="border-b border-border py-4" aria-label="Items">
      <div className="flex justify-between pb-2 text-[13px] text-text-muted">
        <span>Description</span>
        <span>Amount</span>
      </div>
      <ul className="divide-y divide-border">
        {[...items]
          .sort((a, b) => a.position - b.position)
          .map((item) => (
            <li key={item.position} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[16px]">{item.description}</p>
                {Number(item.qty) !== 1 ? (
                  <p className="tabular text-[13px] text-text-muted">
                    {Number(item.qty)} × {money(item.unit_rate_cents)}
                  </p>
                ) : null}
              </div>
              <p className="tabular shrink-0 text-[16px]">{money(item.amount_cents)}</p>
            </li>
          ))}
      </ul>
    </section>
  );
}

/** Subtotal, tax, then the big Total. */
export function PublicTotals({
  subtotalCents,
  taxCents,
  totalCents,
  taxRateBps,
  taxLabel,
  currency,
  locale,
}: {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxRateBps: number;
  taxLabel: string;
  currency: string;
  locale: string;
}) {
  const money = (cents: number) => formatMoney(cents, currency, locale);
  return (
    <>
      <section className="space-y-1.5 border-b border-border py-4 text-[16px]">
        <div className="flex justify-between text-text-muted">
          <span>Subtotal</span>
          <span className="tabular text-text">{money(subtotalCents)}</span>
        </div>
        {taxRateBps > 0 ? (
          <div className="flex justify-between text-text-muted">
            <span>
              {taxLabel} ({formatBpsAsPercent(taxRateBps)}%)
            </span>
            <span className="tabular text-text">{money(taxCents)}</span>
          </div>
        ) : null}
      </section>

      <section className="flex items-baseline justify-between py-4">
        <span className="text-[24px] leading-8 font-bold">Total</span>
        <span className="tabular text-total text-accent">{money(totalCents)}</span>
      </section>
    </>
  );
}
