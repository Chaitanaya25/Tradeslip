"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, Clock, FileText } from "lucide-react";
import { CreateInvoiceButton } from "@/components/invoices/create-invoice-button";
import { SendReminderDialog } from "@/components/reminders/send-reminder-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { useToast } from "@/components/ui/toast";
import type { AttentionItem } from "@/lib/dashboard";

const ICONS = { overdue_invoice: CircleAlert, expiring_quote: Clock, no_reply: FileText, create_invoice: FileText } as const;

/**
 * Things that need the owner's attention. "Send reminder" and "Send follow up" ask for confirmation and then use the
 * same pipeline as the automatic reminders (customer address on file, once, honest result). "Copy link" is the
 * fallback for nudging by text or WhatsApp yourself.
 */
export function NeedsAttention({ items, quoteWord }: { items: AttentionItem[]; quoteWord: string }) {
  const [sharing, setSharing] = useState<AttentionItem | null>(null);
  const toast = useToast();

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy automatically.");
    }
  }

  return (
    <Card className="lg:col-span-1">
      <h2 className="text-h2 mb-5">Needs attention</h2>
      {items.length === 0 ? (
        <p className="text-body text-text-muted">You&apos;re all caught up.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = ICONS[item.type];
            return (
              <li key={item.key} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                <IconTile variant={item.tone === "bad" ? "red" : "default"}>
                  <Icon />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong">{item.title}</p>
                  <p className="text-small text-text-muted">{item.meta}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {item.type === "create_invoice" && item.quoteId ? (
                    <CreateInvoiceButton quoteId={item.quoteId} word={quoteWord} existingInvoiceId={null} variant="outline-accent" />
                  ) : item.share ? (
                    <Button type="button" variant="outline-accent" onClick={() => setSharing(item)}>
                      {item.actionLabel}
                    </Button>
                  ) : (
                    <Button asChild variant="outline-accent">
                      <Link href={item.href}>{item.type === "overdue_invoice" || item.type === "no_reply" ? "Open" : item.actionLabel}</Link>
                    </Button>
                  )}
                  {item.share ? (
                    <button type="button" onClick={() => copy(item.share!.link)} className="text-small rounded-md font-medium text-text-muted hover:text-text hover:underline">
                      Copy link
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {sharing?.share ? (
        <SendReminderDialog
          open
          onOpenChange={(open) => {
            if (!open) setSharing(null);
          }}
          entity={sharing.share.kind}
          id={sharing.share.id}
          customerName={sharing.share.customer.name}
          label={sharing.title}
        />
      ) : null}
    </Card>
  );
}
