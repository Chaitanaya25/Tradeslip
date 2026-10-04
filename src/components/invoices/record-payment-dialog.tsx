"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { SelectField } from "@/components/ui/select-field";
import { useToast } from "@/components/ui/toast";
import { formatCentsForInput } from "@/lib/money-input";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { recordPayment } from "@/server/actions/invoice-payments";

const METHOD_OPTIONS = PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }));

/**
 * Record a payment against an invoice. The amount defaults to the balance; "Mark as fully paid"
 * fills it in. A fresh idempotency key is made each time the dialog opens, so a double click
 * can never record the payment twice. The server re-checks everything.
 */
function PaymentForm({
  onOpenChange,
  invoiceId,
  label,
  remainingCents,
  currency,
  locale,
  today,
}: {
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  /** e.g. "INV-1001" */
  label: string;
  remainingCents: number;
  currency: string;
  locale: string;
  /** Business-local date, yyyy-mm-dd. */
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(() => formatCentsForInput(remainingCents));
  const [method, setMethod] = useState("bank_transfer");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  // One key per opening of the dialog: a double click can never record the payment twice.
  const [key] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit() {
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await recordPayment(invoiceId, { amount, method, paid_on: paidOn, note, idempotency_key: key });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.message);
        return;
      }
      toast.success(result.fullyPaid ? "Payment recorded. The invoice is paid." : `Payment recorded. ${formatMoney(result.remainingCents, currency, locale)} still owed.`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-h2">Record a payment</DialogTitle>
        <DialogDescription className="text-body text-text-muted">
          Invoice {label}. Balance owed: {formatMoney(remainingCents, currency, locale)}.
        </DialogDescription>
      </DialogHeader>

        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <FormField id="pay-amount" label="Amount" error={errors.amount}>
              <MoneyInput id="pay-amount" currency={currency} value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(errors.amount) || undefined} />
            </FormField>
            <button
              type="button"
              className="text-small mt-1.5 rounded-md font-medium text-accent hover:underline"
              onClick={() => setAmount(formatCentsForInput(remainingCents))}
            >
              Mark as fully paid ({formatMoney(remainingCents, currency, locale)})
            </button>
          </div>

          <FormField id="pay-method" label="How was it paid?" error={errors.method}>
            <SelectField id="pay-method" value={method} onChange={setMethod} options={METHOD_OPTIONS} invalid={Boolean(errors.method)} />
          </FormField>

          <FormField id="pay-date" label="Date paid" error={errors.paid_on}>
            <Input id="pay-date" type="date" className="tabular" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} aria-invalid={Boolean(errors.paid_on) || undefined} />
          </FormField>

          <FormField id="pay-note" label="Note (optional)" error={errors.note}>
            <Input id="pay-note" autoComplete="off" placeholder="Cheque number, reference..." value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>

          {formError && Object.keys(errors).length === 0 ? (
            <p role="alert" className="text-small text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !key}>
              {pending ? "Recording..." : "Record payment"}
            </Button>
          </div>
        </form>
    </>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  /** e.g. "INV-1001" */
  label: string;
  remainingCents: number;
  currency: string;
  locale: string;
  /** Business-local date, yyyy-mm-dd. */
  today: string;
};

/** Record a payment against an invoice. The amount defaults to the balance; the server re-checks everything. */
export function RecordPaymentDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open ? <PaymentForm onOpenChange={onOpenChange} {...rest} /> : null}</DialogContent>
    </Dialog>
  );
}
