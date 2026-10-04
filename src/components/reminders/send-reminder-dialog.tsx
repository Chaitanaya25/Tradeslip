"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { sendReminderNow } from "@/server/actions/reminders";

/**
 * Confirm, then send the reminder by the same pipeline the cron uses. The customer's address is read on the
 * server; nothing typed here is ever used as a recipient. The result toast is the real outcome.
 */
export function SendReminderDialog({
  open,
  onOpenChange,
  entity,
  id,
  customerName,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: "quote" | "invoice";
  id: string;
  customerName: string | null;
  /** e.g. "Invoice #INV-1001" */
  label: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendReminderNow(entity, id);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={entity === "invoice" ? "Send a payment reminder?" : "Send a follow-up?"}
      description={`${label}: a polite email goes to ${customerName?.trim() || "the customer"} at the address on file. It counts as the next automatic reminder, so they won't get more than your settings allow.${error ? ` ${error}` : ""}`}
      confirmLabel="Send now"
      pending={pending}
      onConfirm={send}
    />
  );
}
