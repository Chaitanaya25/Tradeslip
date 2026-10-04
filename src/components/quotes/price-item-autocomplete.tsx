"use client";

import { useId, useMemo, useState } from "react";
import type { PriceItemOption } from "@/components/quotes/types";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { applyMarkup } from "@/lib/quote-calc";
import { TYPE_LABELS } from "@/lib/schemas/price-item";

const MAX_RESULTS = 6;

/** The rate a price-book item contributes to a quote (markup applied to materials). */
export function quoteRateFor(item: PriceItemOption): number {
  return item.type === "material" && item.markup_bps > 0 ? applyMarkup(item.rate_cents, item.markup_bps) : item.rate_cents;
}

/**
 * Description field with price-book suggestions. Free text always works; choosing a
 * suggestion also fills the type and rate and links the price item.
 */
export function PriceItemAutocomplete({
  id,
  value,
  onChange,
  onPick,
  options,
  currency,
  locale,
  invalid,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (item: PriceItemOption) => void;
  options: readonly PriceItemOption[];
  currency: string;
  locale: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter((o) => o.name.toLowerCase().includes(q) && o.name.toLowerCase() !== q)
      .slice(0, MAX_RESULTS);
  }, [options, value]);

  const showList = open && matches.length > 0;

  function pick(item: PriceItemOption) {
    onPick(item);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Price book suggestions"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-surface p-1 shadow-pop"
        >
          {matches.map((item, i) => (
            <li
              key={item.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (not click) so the input does not blur and close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-[15px] ${
                i === active ? "bg-surface-muted" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{item.name}</span>
                <span className="text-small block text-text-muted">{TYPE_LABELS[item.type]}</span>
              </span>
              <span className="tabular shrink-0 text-text-muted">{formatMoney(quoteRateFor(item), currency, locale)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
