"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileDown, Link2, Pencil, RefreshCw, Send, Trash2 } from "lucide-react";
import { SendSheet } from "@/components/quotes/send-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { Country } from "@/lib/region";
import { deleteDraftQuote, duplicateQuote } from "@/server/actions/quotes";
import { logQuoteShared, regeneratePublicToken, sendQuoteEmail, type SendUsage } from "@/server/actions/quote-sending";

/** Actions on the detail page. Editing and deleting are for drafts only; sharing is for sent quotes. */
export function QuoteActions({
  quoteId,
  status,
  statusLabel,
  quoteWord,
  docPrefix,
  publicUrl,
  customer,
  businessName,
  country,
  usage,
}: {
  quoteId: string;
  status: string;
  statusLabel: string;
  quoteWord: string;
  docPrefix: string;
  /** The customer link. Null for drafts. */
  publicUrl: string | null;
  customer: { name: string | null; email: string | null; phone: string | null };
  businessName: string;
  country: Country;
  usage: SendUsage | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [link, setLink] = useState(publicUrl);
  const isDraft = status === "draft";
  const canShare = !isDraft && link !== null && (status === "sent" || status === "viewed");
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
        setConfirmingDelete(false);
        return void toast.error(result.message);
      }
      toast.success("Draft deleted.");
      router.replace("/quotes");
    });
  }

  function regenerate() {
    startTransition(async () => {
      const result = await regeneratePublicToken(quoteId);
      setConfirmingRegenerate(false);
      if (!result.ok) return void toast.error(result.message);
      setLink(result.publicUrl);
      toast.success("New link ready. The old one no longer works.");
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
            <Link href={`/quotes/${quoteId}/edit`}>
              <Pencil /> Edit and send
            </Link>
          </Button>
        ) : null}

        {canShare ? (
          <>
            <Button type="button" className="w-full" onClick={() => setSheetOpen(true)}>
              <Send /> Share or resend
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={copyLink}>
              <Link2 /> Copy link
            </Button>
          </>
        ) : null}

        <Button asChild variant="secondary" className="w-full">
          <a href={`/api/pdf/quote/${quoteId}`} target="_blank" rel="noopener noreferrer">
            <FileDown /> Preview PDF
          </a>
        </Button>

        <Button type="button" variant="secondary" className="w-full" onClick={duplicate} disabled={pending}>
          <Copy /> Duplicate
        </Button>

        {canShare ? (
          <Button type="button" variant="secondary" className="w-full" onClick={() => setConfirmingRegenerate(true)} disabled={pending}>
            <RefreshCw /> Regenerate link
          </Button>
        ) : null}

        {isDraft ? (
          <Button type="button" variant="secondary" className="w-full text-destructive" onClick={() => setConfirmingDelete(true)} disabled={pending}>
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
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this draft?"
        description="The draft and its photos will be removed. This can't be undone."
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

      {canShare && link ? (
        <SendSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          link={link}
          onEmail={(to) => sendQuoteEmail(quoteId, to)}
          onShared={(channel) => logQuoteShared(quoteId, channel)}
          customer={customer}
          businessName={businessName}
          country={country}
          quoteWord={quoteWord}
          usage={usage}
          justSent={false}
        />
      ) : null}
    </Card>
  );
}
