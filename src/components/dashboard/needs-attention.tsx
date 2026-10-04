"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, Clock, FileText } from "lucide-react";
import { CreateInvoiceButton } from "@/components/invoices/create-invoice-button";
import { SendSheet } from "@/components/quotes/send-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import type { AttentionItem } from "@/lib/dashboard";
import type { Country } from "@/lib/region";
import { logInvoiceShared, sendInvoiceEmail } from "@/server/actions/invoice-sending";
import { logQuoteShared, sendQuoteEmail } from "@/server/actions/quote-sending";

const ICONS = { overdue_invoice: CircleAlert, expiring_quote: Clock, no_reply: FileText, create_invoice: FileText } as const;

/**
 * Things that need the owner's attention. "Send reminder" and "Send follow up" open the normal
 * Send sheet for that document: the owner decides how to nudge. Nothing is sent automatically.
 */
export function NeedsAttention({ items, businessName, country, quoteWord }: { items: AttentionItem[]; businessName: string; country: Country; quoteWord: string }) {
  const [sharing, setSharing] = useState<AttentionItem | null>(null);

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
                <div className="shrink-0">
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
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {sharing?.share ? (
        <SendSheet
          open
          onOpenChange={(open) => {
            if (!open) setSharing(null);
          }}
          link={sharing.share.link}
          customer={sharing.share.customer}
          businessName={businessName}
          country={country}
          quoteWord={sharing.share.docLabel}
          usage={null}
          justSent={false}
          onEmail={(to) => (sharing.share!.kind === "invoice" ? sendInvoiceEmail(sharing.share!.id, to) : sendQuoteEmail(sharing.share!.id, to))}
          onShared={(channel) => (sharing.share!.kind === "invoice" ? logInvoiceShared(sharing.share!.id, channel) : logQuoteShared(sharing.share!.id, channel))}
        />
      ) : null}
    </Card>
  );
}
