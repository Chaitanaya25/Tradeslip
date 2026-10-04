import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SYMBOLS: Record<string, string> = { USD: "$", GBP: "£", AUD: "$" };

/** Currency symbol for a currency code, e.g. USD -> "$". */
export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? "";
}

type AdornedProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  adornment: string;
  side: "start" | "end";
};

function AdornedInput({ adornment, side, className, ...props }: AdornedProps) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-[15px] text-text-muted",
          side === "start" ? "left-3" : "right-3",
        )}
      >
        {adornment}
      </span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn("tabular", side === "start" ? "pl-7" : "pr-8", className)}
        {...props}
      />
    </div>
  );
}

/** Money text input with a leading currency symbol. Value is typed dollars, parsed by `parseMoneyToCents`. */
export function MoneyInput({
  currency,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type"> & { currency: string }) {
  return <AdornedInput adornment={currencySymbol(currency)} side="start" {...props} />;
}

/** Percent text input with a trailing "%". */
export function PercentInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  return <AdornedInput adornment="%" side="end" {...props} />;
}
