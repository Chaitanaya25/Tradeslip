"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteDraftQuote, duplicateQuote } from "@/server/actions/quotes";

function Disabled({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex w-full rounded-lg">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">Available in the next update</TooltipContent>
    </Tooltip>
  );
}

/** Actions for the detail page. Editing and deleting are for drafts only. */
export function QuoteActions({
  quoteId,
  status,
  statusLabel,
  quoteWord,
  docPrefix,
}: {
  quoteId: string;
  status: string;
  statusLabel: string;
  quoteWord: string;
  docPrefix: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const isDraft = status === "draft";
  const word = quoteWord.toLowerCase();

  function duplicate() {
    startTransition(async () => {
      const result = await duplicateQuote(quoteId);
      if (!result.ok) return void toast.error(result.message);
      toast.success(`Duplicated as ${word} #${docPrefix}${result.number}.`);
      router.push(`/quotes/${result.quoteId}/edit`);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteDraftQuote(quoteId);
      if (!result.ok) {
        setConfirming(false);
        return void toast.error(result.message);
      }
      toast.success("Draft deleted.");
      router.replace("/quotes");
    });
  }

  return (
    <Card>
      <h2 className="text-h2 mb-4">Actions</h2>
      <div className="flex flex-col gap-3">
        {isDraft ? (
          <Button asChild className="w-full">
            <Link href={`/quotes/${quoteId}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
        ) : null}
        <Disabled>
          <Button type="button" disabled className="w-full">
            <Send /> Send to customer
          </Button>
        </Disabled>
        <Disabled>
          <Button type="button" variant="secondary" disabled className="w-full">
            Preview PDF
          </Button>
        </Disabled>
        <Button type="button" variant="secondary" className="w-full" onClick={duplicate} disabled={pending}>
          <Copy /> Duplicate
        </Button>
        {isDraft ? (
          <Button type="button" variant="secondary" className="w-full text-destructive" onClick={() => setConfirming(true)} disabled={pending}>
            <Trash2 /> Delete draft
          </Button>
        ) : null}
      </div>
      {!isDraft ? (
        <p className="text-small mt-4 text-text-muted">
          This {word} is {statusLabel.toLowerCase()}, so it can&apos;t be edited. Duplicate it to make changes.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this draft?"
        description="The draft and its photos will be removed. This can't be undone."
        confirmLabel="Delete draft"
        pending={pending}
        onConfirm={remove}
      />
    </Card>
  );
}
