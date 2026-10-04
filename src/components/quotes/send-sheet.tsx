"use client";

import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Copy, Mail, MessageCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { EMAIL_DELIVERED } from "@/lib/email-errors";
import type { Country } from "@/lib/region";
import { buildShareMessage, normalizePhoneDigits, smsLink, whatsappLink } from "@/lib/share-links";

export type SendUsage = { limit: number | null; remaining: number | null };


export type SendSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: string;
  customer: { name: string | null; email: string | null; phone: string | null };
  businessName: string;
  country: Country;
  /** "Estimate" or "Quote". */
  quoteWord: string;
  usage: SendUsage | null;
  /** True right after the first send, so the sheet can say the document is now marked Sent. */
  justSent: boolean;
  /** Email the link. Success only when the mail server accepted it. */
  onEmail: (to?: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Note that the owner opened the text / WhatsApp composer. */
  onShared: (channel: "sms" | "whatsapp") => unknown;
};

type Delivery = { status: "idle" } | { status: "sending" } | { status: "sent"; message: string } | { status: "error"; message: string };

/** One line of per-action feedback under a delivery button. */
function DeliveryNote({ delivery }: { delivery: Delivery }) {
  if (delivery.status === "sent") {
    return (
      <p role="status" className="text-small mt-2 flex gap-2 text-status-good-text">
        <CircleCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        {delivery.message}
      </p>
    );
  }
  if (delivery.status === "error") {
    return (
      <p role="alert" className="text-small mt-2 flex gap-2 text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        {delivery.message}
      </p>
    );
  }
  return null;
}

/**
 * Share a sent quote or invoice. Opening this sheet is what marks it as Sent. Copying the
 * link, emailing it, and the text / WhatsApp buttons are separate delivery actions, each
 * with its own result, so nothing here claims a message arrived when it may not have.
 */
export function SendSheet({ open, onOpenChange, link, customer, businessName, country, quoteWord, usage, justSent, onEmail, onShared }: SendSheetProps) {
  const toast = useToast();
  const [email, setEmail] = useState(customer.email ?? "");
  const [emailDelivery, setEmailDelivery] = useState<Delivery>({ status: "idle" });
  const [phoneOpened, setPhoneOpened] = useState<{ sms: boolean; whatsapp: boolean }>({ sms: false, whatsapp: false });
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
    setEmailDelivery({ status: "sending" });
    startTransition(async () => {
      const result = await onEmail(email.trim() || undefined);
      if (result.ok) {
        setEmailDelivery({ status: "sent", message: EMAIL_DELIVERED });
        toast.success("Email sent.");
      } else {
        setEmailDelivery({ status: "error", message: result.message });
        toast.error(result.message);
      }
    });
  }

  function shared(channel: "sms" | "whatsapp") {
    // The message itself is sent from the owner's phone; we only note that it was opened.
    setPhoneOpened((current) => ({ ...current, [channel]: true }));
    void onShared(channel);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-h2">{justSent ? `${quoteWord} marked as Sent` : `Share ${word}`}</SheetTitle>
          <SheetDescription className="text-body text-text-muted">
            {justSent
              ? `Opening this marked the ${word} as Sent. Nothing has been delivered yet: email, text message and WhatsApp below are separate steps.`
              : "Email, text message and WhatsApp are separate ways to deliver the link. Each shows its own result."}
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailDelivery({ status: "idle" });
                }}
              />
              <Button type="button" onClick={sendEmail} disabled={pending || !email.trim()}>
                <Mail /> {emailDelivery.status === "sending" ? "Sending..." : "Send"}
              </Button>
            </div>
            {!email.trim() ? <p className="text-small mt-1.5 text-text-muted">Add an email address to send it by email.</p> : null}
            <DeliveryNote delivery={emailDelivery} />
          </div>

          {sms || whatsapp ? (
            <div>
              <p className="text-label mb-2 text-text-muted">Share from your phone</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {sms ? (
                  <div>
                    <Button asChild variant="secondary" className="w-full">
                      <a href={sms} onClick={() => shared("sms")}>
                        <MessageSquare /> Text message
                      </a>
                    </Button>
                    {phoneOpened.sms ? <p className="text-small mt-2 text-text-muted">Opened on your phone. We can&apos;t tell if it was sent.</p> : null}
                  </div>
                ) : null}
                {whatsapp ? (
                  <div>
                    <Button asChild variant="secondary" className="w-full">
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={() => shared("whatsapp")}>
                        <MessageCircle /> WhatsApp
                      </a>
                    </Button>
                    {phoneOpened.whatsapp ? <p className="text-small mt-2 text-text-muted">Opened in WhatsApp. We can&apos;t tell if it was sent.</p> : null}
                  </div>
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
