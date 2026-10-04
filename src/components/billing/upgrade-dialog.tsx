"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { upgradeMessageFor, type LimitKind } from "@/lib/plans";

/**
 * Shown when a plan limit stops something: says which limit, what upgrading gives, and goes to Settings > Billing.
 * The server enforces the limit regardless; this only replaces a vague error with a clear next step.
 */
export function UpgradeDialog({
  limit,
  message,
  plan,
  quoteWord,
  onClose,
}: {
  /** The limit that was hit, or null when the dialog is closed. */
  limit: LimitKind | null;
  /** The server's own wording (it knows the exact numbers); falls back to the standard text. */
  message?: string | null;
  plan?: string;
  quoteWord?: string;
  onClose: () => void;
}) {
  const text = limit ? upgradeMessageFor(limit, { plan, quoteWord }) : null;
  return (
    <Dialog open={limit !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-h2">{text?.title}</DialogTitle>
          <DialogDescription className="text-body text-text-muted">{message || text?.body}</DialogDescription>
        </DialogHeader>
        <p className="text-body">{text?.benefit}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button asChild>
            <Link href="/settings/billing" onClick={onClose}>
              See plans
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
