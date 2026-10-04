import { formatMoney } from "@/lib/money";
import { formatBpsAsPercent } from "@/lib/money-input";

/** Right-aligned subtotal / tax / total, per DESIGN.md: 15px rows, divider, big accent total. */
export function TotalsBlock({
  subtotalCents,
  taxCents,
  totalCents,
  currency,
  locale,
  taxEnabled,
  taxLabel,
  taxRateBps,
}: {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  locale: string;
  taxEnabled: boolean;
  taxLabel: string;
  taxRateBps: number;
}) {
  return (
    <div className="ml-auto w-full max-w-[360px] space-y-1.5" aria-label="Totals">
      <div className="flex items-baseline justify-between text-[15px]">
        <span>Subtotal</span>
        <span className="tabular">{formatMoney(subtotalCents, currency, locale)}</span>
      </div>
      {taxEnabled ? (
        <div className="flex items-baseline justify-between text-[15px]">
          <span>
            {taxLabel} ({formatBpsAsPercent(taxRateBps)}%)
          </span>
          <span className="tabular">{formatMoney(taxCents, currency, locale)}</span>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between border-t border-border-strong pt-3">
        <span className="text-[20px] leading-7 font-bold">Total</span>
        <span className="text-total tabular text-accent" data-testid="quote-total">
          {formatMoney(totalCents, currency, locale)}
        </span>
      </div>
    </div>
  );
}
