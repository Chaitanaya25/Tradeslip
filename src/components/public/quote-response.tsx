"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OTP_LENGTH, isValidCode, normalizeCode } from "@/lib/otp-format";
import { acceptQuote, declineQuote, requestAcceptCode, verifyAcceptCode } from "@/server/actions/public-quote";

/**
 * The customer's three choices on an open quote: Accept (full-width primary), Ask a question
 * (a plain mailto:/sms: link) and Decline (underlined text). Only the dialogs need JS.
 *
 * When the customer has an email on file, accepting takes two steps: confirm name, then enter
 * the 6-digit code emailed to that address. The browser only ever sees a masked address.
 */
export function QuoteResponse({
  token,
  word,
  askHref,
  maskedEmail,
  ownerPreview,
}: {
  token: string;
  /** "estimate" or "quote", lowercase, for sentences. */
  word: string;
  askHref: string | null;
  /** e.g. "j***@gmail.com". Null when no email is on file (single-step accept, stored unverified). */
  maskedEmail: string | null;
  /** The signed-in owner is viewing their own link: responding is disabled. */
  ownerPreview: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"accept" | "decline" | null>(null);
  const [step, setStep] = useState<"details" | "code">("details");
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  // Count the resend cooldown down once a second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function close() {
    setDialog(null);
    setStep("details");
    setCode("");
    setError(null);
  }

  function done() {
    close();
    router.refresh(); // the page re-renders in its accepted / declined state
  }

  /** Step 1 (or the only step when there is no email on file). */
  function submitDetails() {
    setError(null);
    startTransition(async () => {
      if (!maskedEmail) {
        const result = await acceptQuote(token, name, confirmed);
        return result.ok ? done() : setError(result.message);
      }
      const result = await requestAcceptCode(token, name, confirmed);
      if (result.ok) {
        setStep("code");
        setCooldown(result.cooldownSeconds);
        return;
      }
      if (result.code === "cooldown") {
        // A code was already sent a moment ago: go on to entering it.
        setStep("code");
        setCooldown(result.retryAfterSeconds ?? 60);
      }
      setError(result.message);
    });
  }

  function resend() {
    setError(null);
    startTransition(async () => {
      const result = await requestAcceptCode(token, name, confirmed);
      if (result.ok) {
        setCooldown(result.cooldownSeconds);
        setCode("");
      } else {
        if (result.code === "cooldown") setCooldown(result.retryAfterSeconds ?? 60);
        setError(result.message);
      }
    });
  }

  function verify() {
    setError(null);
    startTransition(async () => {
      const result = await verifyAcceptCode(token, name, code);
      if (result.ok) return done();
      setError(result.message);
      if (result.code === "wrong_code") setCode("");
    });
  }

  function decline() {
    setError(null);
    startTransition(async () => {
      const result = await declineQuote(token, reason);
      if (result.ok) return done();
      setError(result.message);
    });
  }

  const codeReady = isValidCode(normalizeCode(code));

  return (
    <div className="space-y-3">
      <Button type="button" className="h-[52px] w-full text-[17px]" onClick={() => setDialog("accept")} disabled={ownerPreview}>
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
          disabled={ownerPreview}
          className="text-body min-h-11 px-3 text-text-muted underline underline-offset-4 hover:text-text disabled:no-underline disabled:opacity-50"
        >
          Decline
        </button>
      </div>

      <Dialog open={dialog === "accept"} onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="sm:max-w-md">
          {step === "details" ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-h2">Accept this {word}</DialogTitle>
                <DialogDescription className="text-body text-text-muted">
                  {maskedEmail
                    ? `Confirm your name. We'll send a code to ${maskedEmail} so we know it's you.`
                    : "Type your full name to confirm. The business will be told straight away."}
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitDetails();
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
                  {pending ? (maskedEmail ? "Sending code..." : "Accepting...") : maskedEmail ? "Email me a code" : `Accept ${word}`}
                </Button>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-h2">Enter your code</DialogTitle>
                <DialogDescription className="text-body text-text-muted">
                  We emailed a {OTP_LENGTH}-digit code to {maskedEmail}. It expires in 10 minutes.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (codeReady) verify();
                }}
              >
                <div>
                  <Label htmlFor="accept-code">{OTP_LENGTH}-digit code</Label>
                  <Input
                    id="accept-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={OTP_LENGTH + 2}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d\s-]/g, ""))}
                    aria-invalid={error ? true : undefined}
                    className="tabular h-14 text-center text-[24px] tracking-[0.4em]"
                  />
                </div>
                {error ? (
                  <p role="alert" className="text-small text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={pending || !codeReady}>
                  {pending ? "Checking..." : `Verify and accept`}
                </Button>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={resend}
                    disabled={pending || cooldown > 0}
                    className="text-small min-h-11 text-text-muted underline underline-offset-4 hover:text-text disabled:no-underline disabled:opacity-60"
                  >
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("details");
                      setCode("");
                      setError(null);
                    }}
                    className="text-small min-h-11 text-text-muted underline underline-offset-4 hover:text-text"
                  >
                    Back
                  </button>
                </div>
              </form>
            </>
          )}
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
