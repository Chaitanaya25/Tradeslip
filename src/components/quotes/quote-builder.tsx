"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, FormProvider, useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { ArrowLeft, Copy, MoreHorizontal, Send, Trash2 } from "lucide-react";
import { CustomerCard } from "@/components/quotes/customer-card";
import { JobPhotos } from "@/components/quotes/job-photos";
import { LineItemsEditor, previewQty, previewRateCents } from "@/components/quotes/line-items-editor";
import { TotalsBlock } from "@/components/quotes/totals-block";
import type { BuilderConfig, CustomerOption, PriceItemOption } from "@/components/quotes/types";
import { useUnsavedGuard } from "@/components/quotes/use-unsaved-guard";
import { VoiceNoteCard, type VoiceAudio } from "@/components/quotes/voice-note-card";
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
import { SendProblemsDialog } from "@/components/quotes/send-problems-dialog";
import { SendSheet } from "@/components/quotes/send-sheet";
import { getSendProblems } from "@/lib/quote-send";
import { zodResolver } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { formatCentsForInput, parsePercentToBps } from "@/lib/money-input";
import { calculateQuoteTotals, depositCents, todayInTimezone } from "@/lib/quote-calc";
import { quoteInputSchema, type QuoteFormValues } from "@/lib/schemas/quote";
import type { DraftApiResponse } from "@/app/api/ai/draft-quote/route";
import { deleteDraftQuote, duplicateQuote, saveQuoteDraft } from "@/server/actions/quotes";
import { sendQuote, type SendUsage } from "@/server/actions/quote-sending";
import type { PhotoDto } from "@/server/actions/quote-photos";

export function QuoteBuilder({
  quoteId,
  number,
  businessId,
  config,
  initialValues,
  customers,
  priceItems,
  photos,
  aiEnabled,
  autoRecord,
  voiceAudioUrl,
}: {
  aiEnabled: boolean;
  autoRecord: boolean;
  /** Signed URL for a voice note already saved on this draft. */
  voiceAudioUrl: string | null;
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
  const [voiceAudio, setVoiceAudio] = useState<VoiceAudio | null>(
    voiceAudioUrl ? { url: voiceAudioUrl, durationSeconds: null } : null,
  );
  const [pendingDraft, setPendingDraft] = useState<{ draft: DraftApiResponse; audio: VoiceAudio } | null>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [sendSession, setSendSession] = useState<{ quoteId: string; link: string; usage: SendUsage } | null>(null);
  const [working, setWorking] = useState<"send" | "preview" | null>(null);

  const resolver = useMemo(() => zodResolver(quoteInputSchema) as unknown as Resolver<QuoteFormValues>, []);
  const form = useForm<QuoteFormValues>({ resolver, defaultValues: initialValues });
  const { control, register, handleSubmit, getValues, setValue, reset, setError, formState } = form;
  const fieldArray = useFieldArray({ control, name: "items" });
  const { dialog: unsavedDialog } = useUnsavedGuard(formState.isDirty);

  const items = useWatch({ control, name: "items" });
  const depositEnabled = useWatch({ control, name: "deposit_enabled" });
  const depositPercent = useWatch({ control, name: "deposit_percent" });
  const transcript = useWatch({ control, name: "transcript" }) ?? "";
  const needsPriceCount = (items ?? []).filter((i) => i.needs_price && previewRateCents(i.rate) === 0).length;
  const fromPriceBook = (items ?? []).some((i) => i.price_item_id);

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

  /** Fill the form from a voice draft. Nothing is saved until "Save draft". */
  function applyDraft(draft: DraftApiResponse, audio: VoiceAudio) {
    const opts = { shouldDirty: true } as const;
    setVoiceAudio(audio.url ? audio : null);
    setValue("voice_note_path", draft.voiceNotePath, opts);
    setValue("transcript", draft.transcript, opts);

    if (draft.items.length === 0 && !draft.customer.name) {
      toast.error("We couldn't pick out a job from that recording. Your transcript is kept; fill the quote in by hand or record again.");
      return;
    }

    const known = draft.customer.customer_id ? customers.find((c) => c.id === draft.customer.customer_id) : undefined;
    const c = draft.customer;
    setValue("customer.customer_id", known?.id ?? "", opts);
    setValue("customer.name", known?.name ?? c.name, opts);
    setValue("customer.email", known?.email ?? c.email, opts);
    setValue("customer.phone", known?.phone ?? c.phone, opts);
    setValue("customer.address_line1", known?.address_line1 ?? c.address_line1, opts);
    setValue("customer.city", known?.city ?? c.city, opts);
    setValue("customer.region", known?.region ?? c.region, opts);
    setValue("customer.postcode", known?.postcode ?? c.postcode, opts);
    setValue("title", draft.job_title, opts);
    setValue("notes", draft.notes ?? "", opts);

    if (draft.items.length > 0) {
      fieldArray.replace(
        draft.items.map((i) => ({
          description: i.description,
          type: i.type,
          qty: String(i.qty),
          rate: i.unit_rate_cents === 0 && i.needs_price ? "" : formatCentsForInput(i.unit_rate_cents),
          price_item_id: i.price_item_id ?? "",
          needs_price: i.needs_price,
        })),
      );
    }
    toast.success(draft.degraded ? "We only caught the words. Check and fill in the details." : "Draft ready. Check it over, then save.");
  }

  function onDraft(draft: DraftApiResponse, audio: VoiceAudio) {
    const values = getValues();
    const hasContent =
      values.customer.name.trim() !== "" || values.items.some((i) => i.description.trim() !== "" || i.rate.trim() !== "");
    if (hasContent && (draft.items.length > 0 || draft.customer.name)) setPendingDraft({ draft, audio });
    else applyDraft(draft, audio);
  }

  function clearVoice() {
    const opts = { shouldDirty: true } as const;
    setValue("voice_note_path", "", opts);
    setValue("transcript", "", opts);
    setVoiceAudio(null);
  }

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

  /** Validate and save the draft (no toast). Returns the saved quote's id, or null if something is wrong. */
  async function persist(): Promise<string | null> {
    setFormError(null);
    if (!(await form.trigger())) {
      toast.error("Fix the highlighted fields first.");
      return null;
    }
    const raw = getValues();
    const result = await saveQuoteDraft(raw, quoteId);
    if (!result.ok) {
      setFormError(result.message);
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        setError(field as `title`, { type: "server", message });
      }
      toast.error(result.message);
      return null;
    }
    reset(raw);
    return result.quoteId;
  }

  /** Send to customer: check what is missing, save, mark as sent, then open the share sheet. */
  async function onSend() {
    const parsed = quoteInputSchema.safeParse(getValues());
    if (!parsed.success) {
      await form.trigger();
      toast.error("Fix the highlighted fields first.");
      return;
    }
    const missing = getSendProblems(
      parsed.data.items,
      { name: parsed.data.customer.name, email: parsed.data.customer.email, phone: parsed.data.customer.phone },
      { validUntil: parsed.data.valid_until, today: todayInTimezone(config.timezone) },
    );
    if (missing.length > 0) return void setProblems(missing);

    setWorking("send");
    try {
      const id = await persist();
      if (!id) return;
      const sent = await sendQuote(id, { channel: "link" });
      if (!sent.ok) {
        if (sent.problems?.length) setProblems(sent.problems);
        else toast.error(sent.message);
        return;
      }
      setSendSession({ quoteId: id, link: sent.publicUrl, usage: sent.usage });
    } finally {
      setWorking(null);
    }
  }

  /** Preview PDF: save first so the PDF matches the screen, then open it in a new tab. */
  async function onPreview() {
    // Open the tab straight away (inside the click) so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    setWorking("preview");
    try {
      const id = formState.isDirty || !quoteId ? await persist() : quoteId;
      if (!id) return void tab?.close();
      if (tab) tab.location.href = `/api/pdf/quote/${id}`;
      else window.open(`/api/pdf/quote/${id}`, "_blank");
      if (!quoteId) router.replace(`/quotes/${id}/edit`);
    } finally {
      setWorking(null);
    }
  }

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
          <VoiceNoteCard
            aiEnabled={aiEnabled}
            businessId={businessId}
            autoRecord={autoRecord}
            transcript={transcript}
            audio={voiceAudio}
            fromPriceBook={fromPriceBook}
            onDraft={onDraft}
            onClear={clearVoice}
          />
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

            {needsPriceCount > 0 ? (
              <p role="status" className="rounded-lg border border-accent-border bg-accent-soft px-4 py-3 text-[15px] font-medium text-accent">
                {needsPriceCount === 1 ? "1 item needs a price" : `${needsPriceCount} items need a price`}
              </p>
            ) : null}
            <LineItemsEditor config={config} priceItems={priceItems} fieldArray={fieldArray} />

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
            <Button type="submit" variant="secondary" disabled={pending || working !== null}>
              {pending ? "Saving..." : "Save draft"}
            </Button>
            <Button type="button" variant="secondary" onClick={onPreview} disabled={pending || working !== null}>
              {working === "preview" ? "Preparing..." : "Preview PDF"}
            </Button>
            <Button type="button" onClick={onSend} disabled={pending || working !== null}>
              <Send /> {working === "send" ? "Sending..." : "Send to customer"}
            </Button>
          </div>
        </Card>
      </form>

      {unsavedDialog}
      <SendProblemsDialog problems={problems} quoteWord={word} onClose={() => setProblems(null)} />
      {sendSession ? (
        <SendSheet
          open
          onOpenChange={(open) => {
            // Once sent the draft is read-only, so closing the sheet goes to the quote's page.
            if (!open) router.replace(`/quotes/${sendSession.quoteId}`);
          }}
          quoteId={sendSession.quoteId}
          link={sendSession.link}
          customer={{
            name: getValues("customer.name") || null,
            email: getValues("customer.email") || null,
            phone: getValues("customer.phone") || null,
          }}
          businessName={config.businessName}
          country={config.country}
          quoteWord={word}
          usage={sendSession.usage}
          justSent
        />
      ) : null}
      <ConfirmDialog
        open={pendingDraft !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDraft(null);
        }}
        title="Replace what you have?"
        description="Replace what you have with the new draft? The customer, job title, items and notes will be overwritten."
        cancelLabel="Keep mine"
        confirmLabel="Replace"
        onConfirm={() => {
          if (pendingDraft) applyDraft(pendingDraft.draft, pendingDraft.audio);
          setPendingDraft(null);
        }}
      />
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
