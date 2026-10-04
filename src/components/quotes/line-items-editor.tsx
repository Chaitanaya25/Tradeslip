"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Copy, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { PriceItemAutocomplete, quoteRateFor } from "@/components/quotes/price-item-autocomplete";
import type { BuilderConfig, PriceItemOption } from "@/components/quotes/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { formatMoney } from "@/lib/money";
import { formatCentsForInput, parseMoneyToCents } from "@/lib/money-input";
import { calculateLine } from "@/lib/quote-calc";
import { emptyItem, type QuoteFormValues } from "@/lib/schemas/quote";
import { cn } from "@/lib/utils";

type ItemValues = QuoteFormValues["items"][number];

/** Live-preview quantity: anything unparseable counts as 0 (the server validates for real). */
export function previewQty(value: string): number {
  const n = Number(value.trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function previewRateCents(value: string): number {
  return parseMoneyToCents(value) ?? 0;
}

// Header and rows share this grid so columns line up (mobile stacks, see Row).
const GRID =
  "grid items-start gap-x-2 gap-y-2 grid-cols-[28px_minmax(0,1fr)_36px] sm:grid-cols-[28px_minmax(0,1fr)_72px_104px_96px_36px]";

function Row({
  index,
  id,
  config,
  priceItems,
  onDuplicate,
  onRemove,
}: {
  index: number;
  id: string;
  config: BuilderConfig;
  priceItems: readonly PriceItemOption[];
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { register, control, setValue, formState } = useFormContext<QuoteFormValues>();
  const item = useWatch({ control, name: `items.${index}` }) as ItemValues | undefined;
  const errors = formState.errors.items?.[index];

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  };

  const rateCents = previewRateCents(item?.rate ?? "");
  const amount = calculateLine(previewQty(item?.qty ?? ""), rateCents);
  const needsPrice = Boolean(item?.needs_price) && rateCents === 0;

  function pick(option: PriceItemOption) {
    const opts = { shouldDirty: true, shouldValidate: false } as const;
    setValue(`items.${index}.description`, option.name, opts);
    setValue(`items.${index}.type`, option.type, opts);
    setValue(`items.${index}.rate`, formatCentsForInput(quoteRateFor(option)), opts);
    setValue(`items.${index}.price_item_id`, option.id, opts);
    setValue(`items.${index}.needs_price`, false, opts);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        GRID,
        "relative -mx-2 rounded-lg border px-2 py-2 transition-colors duration-150",
        needsPrice || isDragging
          ? "border-accent-border bg-accent-soft"
          : "border-transparent focus-within:border-accent-border focus-within:bg-accent-soft",
        isDragging && "z-20 shadow-pop",
      )}
    >
      <button
        type="button"
        aria-label={`Reorder item ${index + 1}`}
        className="col-start-1 row-start-1 flex h-11 cursor-grab touch-none items-center justify-center rounded-md text-text-subtle transition-colors hover:text-text-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" strokeWidth={1.5} />
      </button>

      <div className="col-start-2 row-start-1">
        <Controller
          control={control}
          name={`items.${index}.description`}
          render={({ field }) => (
            <PriceItemAutocomplete
              id={`item-${id}-description`}
              value={field.value}
              onChange={(text) => {
                field.onChange(text);
                // Editing the text breaks the link to the price-book item.
                if (item?.price_item_id) setValue(`items.${index}.price_item_id`, "", { shouldDirty: true });
              }}
              onPick={pick}
              options={priceItems}
              currency={config.currency}
              locale={config.locale}
              invalid={Boolean(errors?.description)}
              placeholder="Describe the work or material"
            />
          )}
        />
        {errors?.description?.message ? (
          <p role="alert" className="text-small mt-1 text-destructive">
            {errors.description.message}
          </p>
        ) : null}
        {needsPrice ? <p className="text-small mt-1 font-medium text-accent">Needs price</p> : null}
      </div>

      <div className="col-start-3 row-start-1 sm:col-start-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="icon" className="size-9 border-transparent bg-transparent" aria-label={`Actions for item ${index + 1}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy /> Duplicate row
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRemove} variant="destructive">
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile: second row under the description. sm+: these become grid columns. */}
      <div className="col-span-3 row-start-2 grid grid-cols-[72px_minmax(0,1fr)_auto] items-start gap-2 pl-[36px] sm:contents">
        <div className="sm:col-auto">
          <Input
            aria-label={`Quantity for item ${index + 1}`}
            inputMode="decimal"
            autoComplete="off"
            className="tabular px-2 text-center"
            aria-invalid={Boolean(errors?.qty) || undefined}
            {...register(`items.${index}.qty`)}
          />
          {errors?.qty?.message ? (
            <p role="alert" className="text-small mt-1 text-destructive sm:w-40">
              {errors.qty.message}
            </p>
          ) : null}
        </div>
        <div>
          <MoneyInput
            aria-label={`Rate for item ${index + 1}`}
            currency={config.currency}
            placeholder="0.00"
            aria-invalid={Boolean(errors?.rate) || undefined}
            className="text-right"
            {...register(`items.${index}.rate`)}
          />
          {errors?.rate?.message ? (
            <p role="alert" className="text-small mt-1 text-destructive sm:w-44">
              {errors.rate.message}
            </p>
          ) : null}
        </div>
        <p className="tabular text-body-strong flex h-11 items-center justify-end">
          {formatMoney(amount, config.currency, config.locale)}
        </p>
      </div>
    </div>
  );
}

/** The line-item editor: sortable rows, price-book autocomplete, live amounts. */
export function LineItemsEditor({
  config,
  priceItems,
}: {
  config: BuilderConfig;
  priceItems: readonly PriceItemOption[];
}) {
  const { control, getValues } = useFormContext<QuoteFormValues>();
  const { fields, append, insert, remove, move } = useFieldArray({ control, name: "items" });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.id === active.id);
    const to = fields.findIndex((f) => f.id === over.id);
    if (from >= 0 && to >= 0) move(from, to);
  }

  return (
    <div>
      <div className={cn(GRID, "hidden rounded-lg bg-surface-muted px-2 py-3 text-label text-text-muted sm:grid -mx-2")}>
        <span className="col-span-2 pl-0.5 sm:col-start-1">
          <span className="pl-[36px]">Item</span>
        </span>
        <span className="text-center">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="mt-2 space-y-1">
            {fields.map((field, index) => (
              <Row
                key={field.id}
                id={field.id}
                index={index}
                config={config}
                priceItems={priceItems}
                onDuplicate={() => insert(index + 1, { ...(getValues(`items.${index}`) as ItemValues) })}
                onRemove={() => remove(index)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {fields.length === 0 ? (
        <p className="text-body py-3 text-text-muted">No items yet. Add the work and materials for this job.</p>
      ) : null}

      <Button type="button" variant="ghost" className="mt-2 gap-2" onClick={() => append(emptyItem())}>
        <Plus className="size-5" strokeWidth={1.75} /> Add item
      </Button>
    </div>
  );
}
