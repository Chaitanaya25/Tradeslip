"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createInvoiceFromQuote } from "@/server/actions/invoices";

/** Runs createInvoiceFromQuote and goes to the invoice (the draft to edit, or the existing one). */
function useCreateFromQuote(quoteId: string, word: string) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function create(onError?: () => void) {
    startTransition(async () => {
      const result = await createInvoiceFromQuote(quoteId);
      if (!result.ok) {
        toast.error(result.message);
        return onError?.();
      }
      if (result.alreadyExisted) toast.success(`An invoice already exists for this ${word.toLowerCase()}.`);
      router.push(result.alreadyExisted ? `/invoices/${result.invoiceId}` : `/invoices/${result.invoiceId}/edit`);
    });
  }
  return { create, pending };
}

/** "Create invoice" for an accepted quote, or "View invoice" when one already exists. */
export function CreateInvoiceButton({
  quoteId,
  word,
  existingInvoiceId,
  variant = "primary",
  className,
}: {
  quoteId: string;
  word: string;
  existingInvoiceId: string | null;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { create, pending } = useCreateFromQuote(quoteId, word);
  if (existingInvoiceId) {
    return (
      <Button asChild variant="secondary" className={className}>
        <Link href={`/invoices/${existingInvoiceId}`}>
          <FileText /> View invoice
        </Link>
      </Button>
    );
  }
  return (
    <Button type="button" variant={variant} className={className} onClick={() => create()} disabled={pending}>
      <FilePlus2 /> {pending ? "Creating..." : "Create invoice"}
    </Button>
  );
}

/** Landing for /invoices/new?quoteId=: creates the invoice once, then moves on. */
export function AutoCreateFromQuote({ quoteId, word }: { quoteId: string; word: string }) {
  const router = useRouter();
  const { create } = useCreateFromQuote(quoteId, word);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    create(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on arrival
  }, []);

  return failed ? (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
      <p className="text-body text-text-muted">We couldn&apos;t create that invoice.</p>
      <Button className="mt-4" onClick={() => router.replace("/invoices")}>
        Go to invoices
      </Button>
    </div>
  ) : (
    <p role="status" className="text-body text-text-muted">
      Creating your invoice...
    </p>
  );
}
