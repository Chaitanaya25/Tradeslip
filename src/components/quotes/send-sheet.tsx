"use client";

import { useState, useTransition } from "react";
import { Copy, Mail, MessageCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { buildShareMessage, normalizePhoneDigits, smsLink, whatsappLink } from "@/lib/share-links";
import type { Country } from "@/lib/region";
import { logQuoteShared, sendQuoteEmail, type SendUsage } from "@/server/actions/quote-sending";

export type SendSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  link: string;
  customer: { name: string | null; email: string | null; phone: string | null };
  businessName: string;
  country: Country;
  /** "Estimate" or "Quote". */
  quoteWord: string;
  usage: SendUsage | null;
  /** True right after the first send, so the heading can say it is on its way. */
  justSent: boolean;
};

/** Share a sent quote: copy the link, email it, or open a prefilled text message / WhatsApp chat. */
export function SendSheet({ open, onOpenChange, quoteId, link, customer, businessName, country, quoteWord, usage, justSent }: SendSheetProps) {
  const toast = useToast();
  const [email, setEmail] = useState(customer.email ?? "");
  const [pending, startTransition] = useTransition();
  const word = quoteWord.toLowerCase();

  const message = buildShareMessage({ customerName: customer.name, quoteWord, businessName, link });
  const digits = normalizePhoneDigits(customer.phone, country);
  const sms = smsLink(digits, message);
  const whatsapp = whatsappLink(digits, message);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy automatically. Select the link and copy it.");
    }
  }

  function sendEmail() {
    startTransition(async () => {
      const result = await sendQuoteEmail(quoteId, email.trim() || undefined);
      if (result.ok) toast.success("Email sent.");
      else toast.error(result.message);
    });
  }

  function shared(channel: "sms" | "whatsapp") {
    // The message itself is sent from the owner's phone; we only note that it was shared.
    void logQuoteShared(quoteId, channel);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-h2">{justSent ? `${quoteWord} sent` : `Share ${word}`}</SheetTitle>
          <SheetDescription className="text-body text-text-muted">
            {justSent
              ? "It's ready for your customer. Share the link however suits them."
              : "Send the link again or copy it."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
          <div>
            <Label htmlFor="share-link">Link</Label>
            <div className="flex gap-2">
              <Input id="share-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="tabular text-[14px]" />
              <Button type="button" variant="secondary" onClick={copy} aria-label="Copy link">
                <Copy /> Copy
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="share-email">Send by email</Label>
            <div className="flex gap-2">
              <Input
                id="share-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="customer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="button" onClick={sendEmail} disabled={pending || !email.trim()}>
                <Mail /> {pending ? "Sending..." : "Send"}
              </Button>
            </div>
            {!email.trim() ? <p className="text-small mt-1.5 text-text-muted">Add an email address to send it by email.</p> : null}
          </div>

          {sms || whatsapp ? (
            <div>
              <p className="text-label mb-2 text-text-muted">Share from your phone</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {sms ? (
                  <Button asChild variant="secondary">
                    <a href={sms} onClick={() => shared("sms")}>
                      <MessageSquare /> Text message
                    </a>
                  </Button>
                ) : null}
                {whatsapp ? (
                  <Button asChild variant="secondary">
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => shared("whatsapp")}>
                      <MessageCircle /> WhatsApp
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {usage && usage.limit !== null ? (
            <p className="text-small rounded-lg bg-surface-muted p-3 text-text-muted">
              Free plan: {usage.remaining} of {usage.limit} {word}s left this month.
            </p>
          ) : null}

          <div className="mt-auto flex justify-end">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
