import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { PLANS, planPrice, yearlySavingPercent, type BillingInterval, type PlanCurrency, type PlanKey } from "@/lib/plans";
import { cn } from "@/lib/utils";

const SHOWN: PlanKey[] = ["free", "pro", "business"];
const LOCALE: Record<PlanCurrency, string> = { USD: "en-US", GBP: "en-GB", AUD: "en-AU" };

/** The price line for a card: "Free", "$19 / month", "$169 / year". Business has no yearly price, so it stays monthly. */
export function priceLine(plan: PlanKey, currency: PlanCurrency, interval: BillingInterval): { main: string; sub: string | null } {
  if (plan === "free") return { main: "Free", sub: "No card needed" };
  const effective: BillingInterval = planPrice(plan, currency, interval) === null ? "month" : interval;
  const cents = planPrice(plan, currency, effective);
  if (cents === null) return { main: "", sub: null };
  const main = formatMoney(cents, currency, LOCALE[currency]).replace(/\.00$/, "");
  const saving = effective === "year" ? yearlySavingPercent(plan, currency) : null;
  return { main: `${main} / ${effective}`, sub: saving ? `Save ${saving}% vs paying monthly` : effective === "month" && plan === "business" ? "Billed monthly" : null };
}

/**
 * Free, Pro and Business side by side, from the plan table. Presentational (no hooks), so the signed-in billing page and
 * the public /pricing page share it; each supplies its own button.
 */
export function PlanCards({
  currency,
  interval,
  current,
  action,
}: {
  currency: PlanCurrency;
  interval: BillingInterval;
  /** The plan in force, to mark "Your plan". */
  current?: PlanKey;
  action: (plan: PlanKey) => ReactNode;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {SHOWN.map((key) => {
        const plan = PLANS[key];
        const price = priceLine(key, currency, interval);
        const isCurrent = current === key;
        return (
          <Card key={key} className={cn("flex flex-col", key === "pro" && "border-accent-border")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-h2">{plan.name}</h3>
              {isCurrent ? <span className="text-label rounded-md bg-accent-soft px-2 py-0.5 text-accent">Your plan</span> : null}
            </div>
            <p className="text-small text-text-muted">{plan.tagline}</p>
            <p className="tabular text-stat mt-4">{price.main}</p>
            <p className="text-small min-h-[18px] text-text-muted">{price.sub}</p>
            <ul className="my-5 flex-1 space-y-2">
              {plan.highlights.map((h) => (
                <li key={h} className="text-body flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-status-good-text" strokeWidth={2} aria-hidden="true" />
                  {h}
                </li>
              ))}
            </ul>
            {action(key)}
          </Card>
        );
      })}
    </div>
  );
}

export { SHOWN as SHOWN_PLANS };
