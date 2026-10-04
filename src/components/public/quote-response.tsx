"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { acceptQuote, declineQuote } from "@/server/actions/public-quote";

/**
 * The customer's three choices on an open quote: Accept (full-width primary), Ask a question
 * (a plain mailto:/sms: link) and Decline (underlined text). Only the two dialogs need JS.
 */
export function QuoteResponse({
  token,
  word,
  askHref,
}: {
  token: string;
  /** "estimate" or "quote", lowercase, for sentences. */
  word: string;
  askHref: string | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"accept" | "decline" | null>(null);
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setDialog(null);
    setError(null);
  }

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptQuote(token, name, confirmed);
      if (!result.ok) return void setError(result.message);
      close();
      router.refresh(); // the page re-renders in its accepted state, with the deposit button if there is one
    });
  }

  function decline() {
    setError(null);
    startTransition(async () => {
      const result = await declineQuote(token, reason);
      if (!result.ok) return void setError(result.message);
      close();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Button type="button" className="h-[52px] w-full text-[17px]" onClick={() => setDialog("accept")}>
        Accept {word}
      </Button>
      {askHref ? (
        <Button asChild variant="secondary" className="h-[52px] w-full text-[17px] text-text-muted">
          <a href={askHref}>Ask a question</a>
        </Button>
      ) : null}
      <div className="pt-1 text-center">
        <button
          type="button"
          onClick={() => setDialog("decline")}
          className="text-body min-h-11 px-3 text-text-muted underline underline-offset-4 hover:text-text"
        >
          Decline
        </button>
      </div>

      <Dialog open={dialog === "accept"} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-h2">Accept this {word}</DialogTitle>
            <DialogDescription className="text-body text-text-muted">
              Type your full name to confirm. The business will be told straight away.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              accept();
            }}
          >
            <div>
              <Label htmlFor="accept-name">Your full name</Label>
              <Input id="accept-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} />
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-accent"
              />
              <span className="text-body">I accept this {word} and its terms</span>
            </label>
            {error ? (
              <p role="alert" className="text-small text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending || name.trim().length < 2 || !confirmed}>
              {pending ? "Accepting..." : `Accept ${word}`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "decline"} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-h2">Decline this {word}?</DialogTitle>
            <DialogDescription className="text-body text-text-muted">
              You can tell the business why. This is optional.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="decline-reason">Reason (optional)</Label>
            <Textarea id="decline-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error ? (
            <p role="alert" className="text-small text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Keep {word}
            </Button>
            <Button type="button" onClick={decline} disabled={pending}>
              {pending ? "Declining..." : `Decline ${word}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
