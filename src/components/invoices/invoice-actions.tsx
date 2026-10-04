"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Banknote, Copy, FileDown, Link2, Pencil, RefreshCw, Send, Trash2 } from "lucide-react";
import { RecordPaymentDialog } from "@/components/invoices/record-payment-dialog";
import { SendSheet } from "@/components/quotes/send-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { canMarkPaid, canSend, canVoid } from "@/lib/invoice-send";
import type { StoredInvoiceStatus } from "@/lib/invoice-calc";
import type { Country } from "@/lib/region";
import { deleteDraftInvoice, duplicateInvoice } from "@/server/actions/invoices";
import { logInvoiceShared, regenerateInvoiceToken, sendInvoiceEmail } from "@/server/actions/invoice-sending";
import { voidInvoice } from "@/server/actions/invoice-payments";

/** Actions on the invoice detail page. Which ones show depends on the stored status and the balance. */
export function InvoiceActions({
  invoiceId,
  status,
  amountPaidCents,
  remainingCents,
  label,
  publicUrl,
  customer,
  businessName,
  country,
  currency,
  locale,
  today,
}: {
  invoiceId: string;
  status: StoredInvoiceStatus;
  amountPaidCents: number;
  remainingCents: number;
  /** e.g. "INV-1001" */
  label: string;
  /** The customer link. Null for drafts and void invoices. */
  publicUrl: string | null;
  customer: { name: string | null; email: string | null; phone: string | null };
  businessName: string;
  country: Country;
  currency: string;
  locale: string;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [paying, setPaying] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [link, setLink] = useState(publicUrl);
  const isDraft = status === "draft";
  const hasLink = link !== null && (status === "sent" || status === "viewed" || status === "paid");
  const canShare = link !== null && canSend(status) && status !== "draft";

  function duplicate() {
    startTransition(async () => {
      const result = await duplicateInvoice(invoiceId);
      if (!result.ok) return void toast.error(result.message);
      toast.success(`Duplicated as invoice #${result.number}.`);
      router.push(`/invoices/${result.invoiceId}/edit`);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteDraftInvoice(invoiceId);
      if (!result.ok) {
        setConfirmingDelete(false);
        return void toast.error(result.message);
      }
      toast.success("Draft deleted.");
      router.replace("/invoices");
    });
  }

  function regenerate() {
    startTransition(async () => {
      const result = await regenerateInvoiceToken(invoiceId);
      setConfirmingRegenerate(false);
      if (!result.ok) return void toast.error(result.message);
      setLink(result.publicUrl);
      toast.success("New link ready. The old one no longer works.");
      router.refresh();
    });
  }

  function confirmVoid() {
    startTransition(async () => {
      const result = await voidInvoice(invoiceId, voidReason);
      if (!result.ok) return void toast.error(result.message);
      setVoiding(false);
      setVoidReason("");
      toast.success("Invoice voided.");
      router.refresh();
    });
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy automatically.");
    }
  }

  return (
    <Card>
      <h2 className="text-h2 mb-4">Actions</h2>
      <div className="flex flex-col gap-3">
        {isDraft ? (
          <Button asChild className="w-full">
            <Link href={`/invoices/${invoiceId}/edit`}>
              <Pencil /> Edit and send
            </Link>
          </Button>
        ) : null}

        {canMarkPaid(status, remainingCents) ? (
          <Button type="button" className="w-full" onClick={() => setPaying(true)}>
            <Banknote /> Record payment
          </Button>
        ) : null}

        {canShare ? (
          <Button type="button" variant="secondary" className="w-full" onClick={() => setSheetOpen(true)}>
            <Send /> Share or resend
          </Button>
        ) : null}
        {hasLink ? (
          <Button type="button" variant="secondary" className="w-full" onClick={copyLink}>
            <Link2 /> Copy link
          </Button>
        ) : null}

        <Button asChild variant="secondary" className="w-full">
          <a href={`/api/pdf/invoice/${invoiceId}`} target="_blank" rel="noopener noreferrer">
            <FileDown /> Preview PDF
          </a>
        </Button>

        <Button type="button" variant="secondary" className="w-full" onClick={duplicate} disabled={pending}>
          <Copy /> Duplicate
        </Button>

        {hasLink ? (
          <Button type="button" variant="secondary" className="w-full" onClick={() => setConfirmingRegenerate(true)} disabled={pending}>
            <RefreshCw /> Regenerate link
          </Button>
        ) : null}

        {isDraft ? (
          <Button type="button" variant="secondary" className="w-full text-destructive" onClick={() => setConfirmingDelete(true)} disabled={pending}>
            <Trash2 /> Delete draft
          </Button>
        ) : null}

        {canVoid(status, amountPaidCents) && !isDraft ? (
          <Button type="button" variant="secondary" className="w-full text-destructive" onClick={() => setVoiding(true)} disabled={pending}>
            <Ban /> Void invoice
          </Button>
        ) : null}
      </div>

      {!isDraft ? (
        <p className="text-small mt-4 text-text-muted">
          {status === "void"
            ? "This invoice is void. Duplicate it to start a new one."
            : "A sent invoice can't be edited. Duplicate it to make changes, or void it if nothing has been paid."}
        </p>
      ) : null}

      <RecordPaymentDialog
        open={paying}
        onOpenChange={setPaying}
        invoiceId={invoiceId}
        label={label}
        remainingCents={remainingCents}
        currency={currency}
        locale={locale}
        today={today}
      />

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this draft?"
        description="The draft will be removed. This can't be undone."
        confirmLabel="Delete draft"
        pending={pending}
        onConfirm={remove}
      />
      <ConfirmDialog
        open={confirmingRegenerate}
        onOpenChange={setConfirmingRegenerate}
        title="Make a new link?"
        description={`The old link will stop working straight away. Anyone you already sent it to will see "This link isn't working", so you'll need to send them the new one.`}
        confirmLabel="Make new link"
        pending={pending}
        onConfirm={regenerate}
      />

      <Dialog open={voiding} onOpenChange={(open) => (pending ? null : setVoiding(open))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-h2">Void this invoice?</DialogTitle>
            <DialogDescription className="text-body text-text-muted">
              It is kept for your records but can no longer be paid or sent, and its link stops working for the customer.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="void-reason">Reason (optional)</Label>
            <Input id="void-reason" autoComplete="off" maxLength={300} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Entered twice" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setVoiding(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={confirmVoid} disabled={pending}>
              {pending ? "Working..." : "Void invoice"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {canShare && link ? (
        <SendSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          link={link}
          onEmail={(to) => sendInvoiceEmail(invoiceId, to)}
          onShared={(channel) => logInvoiceShared(invoiceId, channel)}
          customer={customer}
          businessName={businessName}
          country={country}
          quoteWord="Invoice"
          usage={null}
          justSent={false}
        />
      ) : null}
    </Card>
  );
}
