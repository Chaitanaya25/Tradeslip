"use client";

import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Search, UserPlus, X } from "lucide-react";
import type { CustomerOption } from "@/components/quotes/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { REGIONS, type Country } from "@/lib/region";
import { emptyCustomer, type QuoteFormValues } from "@/lib/schemas/quote";

const MAX_RESULTS = 6;

function summary(c: CustomerOption): string {
  return [c.address_line1, c.city].filter(Boolean).join(", ") || c.phone || c.email || "";
}

/** Customer details, with a search over existing customers. Picking one fills the form. */
export function CustomerCard({ customers, country }: { customers: readonly CustomerOption[]; country: Country }) {
  const { register, setValue, watch, formState } = useFormContext<QuoteFormValues>();
  const errors = formState.errors.customer;
  const labels = REGIONS[country].address;
  const linkedId = watch("customer.customer_id");

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
  }, [customers, query]);
  const showList = open && results.length > 0;

  function choose(c: CustomerOption) {
    const opts = { shouldDirty: true } as const;
    setValue("customer.customer_id", c.id, opts);
    setValue("customer.name", c.name, opts);
    setValue("customer.email", c.email ?? "", opts);
    setValue("customer.phone", c.phone ?? "", opts);
    setValue("customer.address_line1", c.address_line1 ?? "", opts);
    setValue("customer.city", c.city ?? "", opts);
    setValue("customer.region", c.region ?? "", opts);
    setValue("customer.postcode", c.postcode ?? "", opts);
    setQuery("");
    setOpen(false);
  }

  function startNew() {
    const blank = emptyCustomer();
    for (const [key, value] of Object.entries(blank)) {
      setValue(`customer.${key}` as `customer.name`, value, { shouldDirty: true });
    }
    setQuery("");
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-h2">Customer</h2>
        {linkedId ? (
          <Button type="button" variant="ghost" onClick={startNew} className="gap-1.5">
            <UserPlus className="size-4" /> New customer
          </Button>
        ) : null}
      </div>

      {customers.length > 0 ? (
        <div className="relative mb-5">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
          <Input
            type="search"
            value={query}
            autoComplete="off"
            placeholder="Find an existing customer"
            aria-label="Find an existing customer"
            role="combobox"
            aria-expanded={showList}
            aria-controls="customer-results"
            className="pl-10"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (!showList) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (a + 1) % results.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a - 1 + results.length) % results.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(results[active]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {showList ? (
            <ul
              id="customer-results"
              role="listbox"
              className="absolute top-full right-0 left-0 z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-surface p-1 shadow-pop"
            >
              {results.map((c, i) => (
                <li
                  key={c.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(c);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer rounded-md px-2.5 py-2 ${i === active ? "bg-surface-muted" : ""}`}
                >
                  <span className="text-body-strong block">{c.name}</span>
                  <span className="text-small block text-text-muted">{summary(c)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {linkedId ? (
        <p className="text-small mb-4 flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-text-muted">
          Existing customer. Changes you save here update their record.
          <button type="button" onClick={startNew} aria-label="Unlink customer" className="ml-auto rounded p-0.5 hover:bg-border">
            <X className="size-4" />
          </button>
        </p>
      ) : null}

      <div className="space-y-4">
        <FormField id="customer-name" label="Full name" error={errors?.name?.message}>
          <Input id="customer-name" autoComplete="off" aria-invalid={Boolean(errors?.name) || undefined} {...register("customer.name")} />
        </FormField>
        <FormField id="customer-address" label="Address" error={errors?.address_line1?.message}>
          <Input id="customer-address" autoComplete="off" {...register("customer.address_line1")} />
        </FormField>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[1fr_120px_120px]">
          <FormField id="customer-city" label="City" error={errors?.city?.message} className="col-span-2 sm:col-span-1">
            <Input id="customer-city" autoComplete="off" {...register("customer.city")} />
          </FormField>
          <FormField id="customer-region" label={labels.regionLabel.replace(" (optional)", "")} error={errors?.region?.message}>
            <Input id="customer-region" autoComplete="off" {...register("customer.region")} />
          </FormField>
          <FormField id="customer-postcode" label={labels.postcodeLabel} error={errors?.postcode?.message}>
            <Input id="customer-postcode" autoComplete="off" {...register("customer.postcode")} />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="customer-phone" label="Phone" error={errors?.phone?.message}>
            <Input id="customer-phone" type="tel" inputMode="tel" autoComplete="off" {...register("customer.phone")} />
          </FormField>
          <FormField id="customer-email" label="Email" error={errors?.email?.message}>
            <Input id="customer-email" type="email" inputMode="email" autoComplete="off" {...register("customer.email")} />
          </FormField>
        </div>
      </div>
    </Card>
  );
}
