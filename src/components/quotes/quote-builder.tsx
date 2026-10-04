"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, FormProvider, useForm, useWatch, type Resolver } from "react-hook-form";
import { ArrowLeft, Copy, MoreHorizontal, Send, Trash2 } from "lucide-react";
import { CustomerCard } from "@/components/quotes/customer-card";
import { JobPhotos } from "@/components/quotes/job-photos";
import { LineItemsEditor, previewQty, previewRateCents } from "@/components/quotes/line-items-editor";
import { TotalsBlock } from "@/components/quotes/totals-block";
import type { BuilderConfig, CustomerOption, PriceItemOption } from "@/components/quotes/types";
import { useUnsavedGuard } from "@/components/quotes/use-unsaved-guard";
import { VoiceNoteCard } from "@/components/quotes/voice-note-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/money-input";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { zodResolver } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { parsePercentToBps } from "@/lib/money-input";
import { calculateQuoteTotals, depositCents } from "@/lib/quote-calc";
import { quoteInputSchema, type QuoteFormValues } from "@/lib/schemas/quote";
import { deleteDraftQuote, duplicateQuote, saveQuoteDraft } from "@/server/actions/quotes";
import type { PhotoDto } from "@/server/actions/quote-photos";

const NEXT_UPDATE = "Available in the next update";

function DisabledAction({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events, so the tooltip hangs off a focusable wrapper. */}
        <span tabIndex={0} className="inline-flex rounded-lg">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{NEXT_UPDATE}</TooltipContent>
    </Tooltip>
  );
}

export function QuoteBuilder({
  quoteId,
  number,
  businessId,
  config,
  initialValues,
  customers,
  priceItems,
  photos,
}: {
  quoteId: string | null;
  number: number | null;
  businessId: string;
  config: BuilderConfig;
  initialValues: QuoteFormValues;
  customers: CustomerOption[];
  priceItems: PriceItemOption[];
  photos: PhotoDto[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const resolver = useMemo(() => zodResolver(quoteInputSchema) as unknown as Resolver<QuoteFormValues>, []);
  const form = useForm<QuoteFormValues>({ resolver, defaultValues: initialValues });
  const { control, register, handleSubmit, getValues, reset, setError, formState } = form;
  const { dialog: unsavedDialog } = useUnsavedGuard(formState.isDirty);

  const items = useWatch({ control, name: "items" });
  const depositEnabled = useWatch({ control, name: "deposit_enabled" });
  const depositPercent = useWatch({ control, name: "deposit_percent" });

  // Live preview only. The server recomputes everything when saving.
  const totals = useMemo(
    () =>
      calculateQuoteTotals(
        (items ?? []).map((i) => ({ qty: previewQty(i.qty), unitRateCents: previewRateCents(i.rate) })),
        config.taxEnabled,
        config.taxRateBps,
      ),
    [items, config.taxEnabled, config.taxRateBps],
  );
  const depositBps = parsePercentToBps(depositPercent ?? "", 100) ?? 0;
  const depositAmount = depositCents(totals.totalCents, depositBps);

  const word = config.quoteWord;
  const heading = number ? `${word} #${config.docPrefix}${number}` : `New ${word.toLowerCase()}`;

  const save = handleSubmit(() => {
    setFormError(null);
    const raw = getValues();
    startTransition(async () => {
      const result = await saveQuoteDraft(raw, quoteId);
      if (!result.ok) {
        setFormError(result.message);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(field as `title`, { type: "server", message });
        }
        toast.error(result.message);
        return;
      }
      reset(raw); // clean state, so leaving the page does not warn
      toast.success(result.created ? "Draft saved." : "Changes saved.");
      if (result.created) router.replace(`/quotes/${result.quoteId}/edit`);
    });
  });

  function duplicate() {
    if (!quoteId) return;
    if (formState.isDirty) {
      toast.error("Save your changes first, then duplicate.");
      return;
    }
    startTransition(async () => {
      const result = await duplicateQuote(quoteId);
      if (!result.ok) return void toast.error(result.message);
      toast.success(`Duplicated as ${word.toLowerCase()} #${config.docPrefix}${result.number}.`);
      router.push(`/quotes/${result.quoteId}/edit`);
    });
  }

  function remove() {
    if (!quoteId) return;
    startTransition(async () => {
      const result = await deleteDraftQuote(quoteId);
      if (!result.ok) {
        setConfirmDelete(false);
        return void toast.error(result.message);
      }
      reset(getValues());
      toast.success("Draft deleted.");
      router.replace("/quotes");
    });
  }

  return (
    <FormProvider {...form}>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/quotes"
          aria-label="Back to quotes"
          className="flex size-10 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface-muted"
        >
          <ArrowLeft className="size-6" strokeWidth={1.5} />
        </Link>
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.01em]">{quoteId ? `Edit ${word.toLowerCase()}` : `New ${word.toLowerCase()}`}</h1>
      </div>

      <form onSubmit={save} noValidate className="grid items-start gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <VoiceNoteCard />
          <CustomerCard customers={customers} country={config.country} />
        </div>

        <Card className="lg:col-span-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-display">{heading}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-text-muted">
                <label htmlFor="valid_until" className="text-body">
                  Valid until
                </label>
                <Input
                  id="valid_until"
                  type="date"
                  className="tabular h-9 w-auto px-2 text-[15px]"
                  aria-invalid={Boolean(formState.errors.valid_until) || undefined}
                  {...register("valid_until")}
                />
              </div>
              {formState.errors.valid_until?.message ? (
                <p role="alert" className="text-small mt-1 text-destructive">
                  {formState.errors.valid_until.message}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <StatusPill status="draft">
                <span className="mr-1.5 inline-block size-2 rounded-full bg-text-muted" aria-hidden="true" />
                Draft
              </StatusPill>
              {quoteId ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="icon" className="size-9 border-transparent bg-transparent" aria-label="More actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={duplicate}>
                      <Copy /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                      <Trash2 /> Delete draft
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          <div className="mt-6 space-y-6">
            <FormField id="title" label="Job title (optional)" error={formState.errors.title?.message}>
              <Input id="title" autoComplete="off" placeholder="Kitchen tap replacement" {...register("title")} />
            </FormField>

            <LineItemsEditor config={config} priceItems={priceItems} />

            <div className="border-t border-border pt-5">
              <TotalsBlock
                subtotalCents={totals.subtotalCents}
                taxCents={totals.taxCents}
                totalCents={totals.totalCents}
                currency={config.currency}
                locale={config.locale}
                taxEnabled={config.taxEnabled}
                taxLabel={config.taxLabel}
                taxRateBps={config.taxRateBps}
              />
            </div>

            <div className="space-y-5 border-t border-border pt-5">
              <div>
                <Controller
                  control={control}
                  name="deposit_enabled"
                  render={({ field }) => (
                    <Toggle
                      id="deposit_enabled"
                      label={`Request ${depositBps > 0 ? parseFloat((depositBps / 100).toFixed(2)) : 30}% deposit`}
                      description="A deposit request will be included in the quote."
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                {depositEnabled ? (
                  <div className="mt-3 ml-14 flex flex-wrap items-start gap-4">
                    <FormField id="deposit_percent" label="Deposit" error={formState.errors.deposit_percent?.message} className="w-32">
                      <PercentInput id="deposit_percent" placeholder="30" {...register("deposit_percent")} />
                    </FormField>
                    <p className="text-body mt-7">
                      Deposit due: <span className="tabular text-body-strong">{formatMoney(depositAmount, config.currency, config.locale)}</span>
                    </p>
                  </div>
                ) : null}
              </div>

              <Controller
                control={control}
                name="include_photos"
                render={({ field }) => (
                  <Toggle
                    id="include_photos"
                    label="Include job photos"
                    description="Attach photos from this job to the quote."
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />

              <div>
                <p className="text-label mb-2 text-text-muted">Job photos</p>
                <JobPhotos businessId={businessId} quoteId={quoteId} initialPhotos={photos} />
              </div>

              <FormField id="notes" label="Notes" error={formState.errors.notes?.message}>
                <Textarea id="notes" rows={3} placeholder="Anything the customer should know" {...register("notes")} />
              </FormField>
            </div>

            {formError ? (
              <p role="alert" className="text-small text-destructive">
                {formError}
              </p>
            ) : null}
          </div>

          {/* Sticky action bar: sits above the mobile tab bar, at the bottom edge on larger screens. */}
          <div className="sticky bottom-[calc(57px+env(safe-area-inset-bottom))] z-20 -mx-6 mt-6 -mb-6 flex flex-wrap items-center justify-end gap-3 rounded-b-lg border-t border-border bg-surface px-6 py-4 md:bottom-0">
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Saving..." : "Save draft"}
            </Button>
            <DisabledAction>
              <Button type="button" variant="secondary" disabled>
                Preview PDF
              </Button>
            </DisabledAction>
            <DisabledAction>
              <Button type="button" disabled>
                <Send /> Send to customer
              </Button>
            </DisabledAction>
          </div>
        </Card>
      </form>

      {unsavedDialog}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this draft?"
        description="The draft and its photos will be removed. This can't be undone."
        confirmLabel="Delete draft"
        pending={pending}
        onConfirm={remove}
      />
    </FormProvider>
  );
}
