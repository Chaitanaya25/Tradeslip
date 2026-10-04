"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormProvider, useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { ArrowLeft, Copy, MoreHorizontal, Send, Trash2 } from "lucide-react";
import { CustomerCard } from "@/components/quotes/customer-card";
import { LineItemsEditor, previewQty, previewRateCents } from "@/components/quotes/line-items-editor";
import { SendProblemsDialog } from "@/components/quotes/send-problems-dialog";
import { SendSheet } from "@/components/quotes/send-sheet";
import { TotalsBlock } from "@/components/quotes/totals-block";
import type { BuilderConfig, CustomerOption, PriceItemOption } from "@/components/quotes/types";
import { useUnsavedGuard } from "@/components/quotes/use-unsaved-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { zodResolver } from "@/lib/forms";
import { defaultDueDate } from "@/lib/invoice-calc";
import { getInvoiceSendProblems } from "@/lib/invoice-send";
import { calculateQuoteTotals } from "@/lib/quote-calc";
import { invoiceInputSchema, type InvoiceFormValues } from "@/lib/schemas/invoice";
import type { QuoteFormValues } from "@/lib/schemas/quote";
import { deleteDraftInvoice, duplicateInvoice, saveInvoiceDraft } from "@/server/actions/invoices";
import { logInvoiceShared, sendInvoice, sendInvoiceEmail } from "@/server/actions/invoice-sending";

/** Invoice builder: the quote builder's layout without the voice note, deposit and photos. */
export function InvoiceBuilder({
  invoiceId,
  number,
  config,
  paymentTermsDays,
  initialValues,
  customers,
  priceItems,
  fromEstimate,
}: {
  invoiceId: string | null;
  number: number | null;
  config: BuilderConfig;
  paymentTermsDays: number;
  initialValues: InvoiceFormValues;
  customers: CustomerOption[];
  priceItems: PriceItemOption[];
  /** Set when this draft was created from an accepted quote (e.g. "Estimate #1047"). */
  fromEstimate: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [sendSession, setSendSession] = useState<{ invoiceId: string; link: string } | null>(null);
  const [working, setWorking] = useState<"send" | "preview" | null>(null);
  // Until the user edits the due date by hand, it follows the issue date by the payment terms.
  const [dueTouched, setDueTouched] = useState(initialValues.due_date !== defaultDueDate(initialValues.issue_date || "1970-01-01", paymentTermsDays));

  const resolver = useMemo(() => zodResolver(invoiceInputSchema) as unknown as Resolver<InvoiceFormValues>, []);
  const form = useForm<InvoiceFormValues>({ resolver, defaultValues: initialValues });
  const { control, register, handleSubmit, getValues, setValue, reset, setError, formState } = form;
  const fieldArray = useFieldArray({ control, name: "items" });
  const { dialog: unsavedDialog } = useUnsavedGuard(formState.isDirty);

  const items = useWatch({ control, name: "items" });
  const needsPriceCount = (items ?? []).filter((i) => i.needs_price && previewRateCents(i.rate) === 0).length;

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

  const heading = number ? `Invoice #${config.docPrefix}${number}` : "New invoice";
  const issueField = register("issue_date");
  const dueField = register("due_date");

  function showServerErrors(result: { message: string; fieldErrors?: Record<string, string> }) {
    setFormError(result.message);
    for (const [field, message] of Object.entries(result.fieldErrors ?? {})) setError(field as "title", { type: "server", message });
    toast.error(result.message);
  }

  const save = handleSubmit(() => {
    setFormError(null);
    const raw = getValues();
    startTransition(async () => {
      const result = await saveInvoiceDraft(raw, invoiceId);
      if (!result.ok) return showServerErrors(result);
      reset(raw);
      toast.success(result.created ? "Draft saved." : "Changes saved.");
      if (result.created) router.replace(`/invoices/${result.invoiceId}/edit`);
    });
  });

  /** Validate and save the draft (no toast). Returns the saved invoice's id, or null if something is wrong. */
  async function persist(): Promise<string | null> {
    setFormError(null);
    if (!(await form.trigger())) {
      toast.error("Fix the highlighted fields first.");
      return null;
    }
    const raw = getValues();
    const result = await saveInvoiceDraft(raw, invoiceId);
    if (!result.ok) {
      showServerErrors(result);
      return null;
    }
    reset(raw);
    return result.invoiceId;
  }

  /** Send to customer: check what is missing, save, mark as sent, then open the share sheet. */
  async function onSend() {
    const parsed = invoiceInputSchema.safeParse(getValues());
    if (!parsed.success) {
      await form.trigger();
      toast.error("Fix the highlighted fields first.");
      return;
    }
    const missing = getInvoiceSendProblems(
      parsed.data.items,
      { name: parsed.data.customer.name, email: parsed.data.customer.email, phone: parsed.data.customer.phone },
      { issueDate: parsed.data.issue_date, dueDate: parsed.data.due_date },
    );
    if (missing.length > 0) return void setProblems(missing);

    setWorking("send");
    try {
      const id = await persist();
      if (!id) return;
      const sent = await sendInvoice(id, { channel: "link" });
      if (!sent.ok) {
        if (sent.problems?.length) setProblems(sent.problems);
        else toast.error(sent.message);
        return;
      }
      setSendSession({ invoiceId: id, link: sent.publicUrl });
    } finally {
      setWorking(null);
    }
  }

  /** Preview PDF: save first so the PDF matches the screen, then open it in a new tab. */
  async function onPreview() {
    const tab = window.open("", "_blank");
    setWorking("preview");
    try {
      const id = formState.isDirty || !invoiceId ? await persist() : invoiceId;
      if (!id) return void tab?.close();
      if (tab) tab.location.href = `/api/pdf/invoice/${id}`;
      else window.open(`/api/pdf/invoice/${id}`, "_blank");
      if (!invoiceId) router.replace(`/invoices/${id}/edit`);
    } finally {
      setWorking(null);
    }
  }

  function duplicate() {
    if (!invoiceId) return;
    if (formState.isDirty) return void toast.error("Save your changes first, then duplicate.");
    startTransition(async () => {
      const result = await duplicateInvoice(invoiceId);
      if (!result.ok) return void toast.error(result.message);
      toast.success(`Duplicated as invoice #${config.docPrefix}${result.number}.`);
      router.push(`/invoices/${result.invoiceId}/edit`);
    });
  }

  function remove() {
    if (!invoiceId) return;
    startTransition(async () => {
      const result = await deleteDraftInvoice(invoiceId);
      if (!result.ok) {
        setConfirmDelete(false);
        return void toast.error(result.message);
      }
      reset(getValues());
      toast.success("Draft deleted.");
      router.replace("/invoices");
    });
  }

  return (
    <FormProvider {...(form as unknown as ReturnType<typeof useForm<QuoteFormValues>>)}>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/invoices"
          aria-label="Back to invoices"
          className="flex size-10 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface-muted"
        >
          <ArrowLeft className="size-6" strokeWidth={1.5} />
        </Link>
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.01em]">{invoiceId ? "Edit invoice" : "New invoice"}</h1>
      </div>

      <form onSubmit={save} noValidate className="grid items-start gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <CustomerCard customers={customers} country={config.country} />
        </div>

        <Card className="lg:col-span-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-display">{heading}</h2>
              {fromEstimate ? <p className="text-small text-text-muted">From {fromEstimate}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-text-muted">
                <div className="flex items-center gap-2">
                  <label htmlFor="issue_date" className="text-body">
                    Issued
                  </label>
                  <Input
                    id="issue_date"
                    type="date"
                    className="tabular h-9 w-auto px-2 text-[15px]"
                    aria-invalid={Boolean(formState.errors.issue_date) || undefined}
                    {...issueField}
                    onChange={(e) => {
                      void issueField.onChange(e);
                      if (!dueTouched && e.target.value) setValue("due_date", defaultDueDate(e.target.value, paymentTermsDays), { shouldDirty: true });
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="due_date" className="text-body">
                    Due
                  </label>
                  <Input
                    id="due_date"
                    type="date"
                    className="tabular h-9 w-auto px-2 text-[15px]"
                    aria-invalid={Boolean(formState.errors.due_date) || undefined}
                    {...dueField}
                    onChange={(e) => {
                      setDueTouched(true);
                      void dueField.onChange(e);
                    }}
                  />
                </div>
              </div>
              {formState.errors.issue_date?.message || formState.errors.due_date?.message ? (
                <p role="alert" className="text-small mt-1 text-destructive">
                  {formState.errors.issue_date?.message ?? formState.errors.due_date?.message}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <StatusPill status="draft">
                <span className="mr-1.5 inline-block size-2 rounded-full bg-text-muted" aria-hidden="true" />
                Draft
              </StatusPill>
              {invoiceId ? (
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
            <LineItemsEditor config={config} priceItems={priceItems} fieldArray={fieldArray as unknown as Parameters<typeof LineItemsEditor>[0]["fieldArray"]} />

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

            <div className="border-t border-border pt-5">
              <FormField id="notes" label="Notes" error={formState.errors.notes?.message}>
                <Textarea id="notes" rows={3} placeholder="Payment details or anything the customer should know" {...register("notes")} />
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
      <SendProblemsDialog problems={problems} quoteWord="Invoice" onClose={() => setProblems(null)} />
      {sendSession ? (
        <SendSheet
          open
          onOpenChange={(open) => {
            // Once sent the draft is read-only, so closing the sheet goes to the invoice's page.
            if (!open) router.replace(`/invoices/${sendSession.invoiceId}`);
          }}
          link={sendSession.link}
          onEmail={(to) => sendInvoiceEmail(sendSession.invoiceId, to)}
          onShared={(channel) => logInvoiceShared(sendSession.invoiceId, channel)}
          customer={{
            name: getValues("customer.name") || null,
            email: getValues("customer.email") || null,
            phone: getValues("customer.phone") || null,
          }}
          businessName={config.businessName}
          country={config.country}
          quoteWord="Invoice"
          usage={null}
          justSent
        />
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this draft?"
        description="The draft will be removed. This can't be undone."
        confirmLabel="Delete draft"
        pending={pending}
        onConfirm={remove}
      />
    </FormProvider>
  );
}
