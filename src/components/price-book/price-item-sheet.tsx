"use client";

import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { MoneyInput, PercentInput } from "@/components/ui/money-input";
import { SelectField } from "@/components/ui/select-field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { zodResolver } from "@/lib/forms";
import { formatBpsAsPercent, formatCentsForInput } from "@/lib/money-input";
import {
  PRICE_ITEM_TYPES,
  PRICE_ITEM_UNITS,
  TYPE_LABELS,
  UNIT_LABELS,
  priceItemSchema,
  type PriceItemInput,
} from "@/lib/schemas/price-item";
import { createPriceItem, updatePriceItem } from "@/server/actions/price-items";

export type PriceItemRow = {
  id: string;
  name: string;
  type: (typeof PRICE_ITEM_TYPES)[number];
  unit: (typeof PRICE_ITEM_UNITS)[number];
  rate_cents: number;
  markup_bps: number;
  archived: boolean;
};

const typeOptions = PRICE_ITEM_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }));
const unitOptions = PRICE_ITEM_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }));

function ItemForm({
  item,
  currency,
  onDone,
}: {
  item: PriceItemRow | null;
  currency: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(priceItemSchema) as unknown as Resolver<PriceItemInput>, []);
  const { register, control, handleSubmit, setError, formState } = useForm<PriceItemInput>({
    resolver,
    defaultValues: {
      name: item?.name ?? "",
      type: item?.type ?? "labour",
      unit: item?.unit ?? "job",
      rate: item ? formatCentsForInput(item.rate_cents) : "",
      markup: item && item.markup_bps > 0 ? formatBpsAsPercent(item.markup_bps) : "",
    },
  });
  const errors = formState.errors;
  const type = useWatch({ control, name: "type" });

  const submit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = item ? await updatePriceItem(item.id, values) : await createPriceItem(values);
      if (!result.ok) {
        setFormError(result.message);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(field as keyof PriceItemInput, { type: "server", message });
        }
        return;
      }
      toast.success(item ? "Item saved." : "Item added to your price book.");
      onDone();
    });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6">
      <FormField id="item-name" label="Name" error={errors.name?.message}>
        <Input id="item-name" autoFocus placeholder="Kitchen mixer tap replacement" {...register("name")} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField id="item-type" label="Type" error={errors.type?.message}>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <SelectField id="item-type" value={field.value} onChange={field.onChange} options={typeOptions} />
            )}
          />
        </FormField>
        <FormField id="item-unit" label="Unit" error={errors.unit?.message}>
          <Controller
            control={control}
            name="unit"
            render={({ field }) => (
              <SelectField id="item-unit" value={field.value} onChange={field.onChange} options={unitOptions} />
            )}
          />
        </FormField>
      </div>

      <FormField id="item-rate" label="Rate" error={errors.rate?.message}>
        <MoneyInput id="item-rate" currency={currency} placeholder="0.00" {...register("rate")} />
      </FormField>

      {type === "material" ? (
        <FormField
          id="item-markup"
          label="Markup (optional)"
          error={errors.markup?.message}
          hint="Added on top of the rate when this material goes on a quote."
        >
          <PercentInput id="item-markup" placeholder="20" {...register("markup")} />
        </FormField>
      ) : null}

      {formError ? (
        <p role="alert" className="text-small text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="mt-auto flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : item ? "Save changes" : "Add item"}
        </Button>
      </div>
    </form>
  );
}

/** Right-side sheet for adding or editing a price-book item. The form remounts on each open. */
export function PriceItemSheet({
  open,
  onOpenChange,
  item,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PriceItemRow | null;
  currency: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-h2">{item ? "Edit item" : "Add item"}</SheetTitle>
          <SheetDescription className="text-body text-text-muted">
            Items in your price book are used when you build a quote or draft one by voice.
          </SheetDescription>
        </SheetHeader>
        <ItemForm key={item?.id ?? "new"} item={item} currency={currency} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
