"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Checklist of what still blocks sending, so the owner knows exactly what to fix. */
export function SendProblemsDialog({
  problems,
  quoteWord,
  onClose,
}: {
  problems: string[] | null;
  quoteWord: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={problems !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-h2">Almost ready to send</DialogTitle>
          <DialogDescription className="text-body text-text-muted">
            Fix {problems && problems.length === 1 ? "this" : "these"} and the {quoteWord.toLowerCase()} can go out:
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {(problems ?? []).map((problem) => (
            <li key={problem} className="flex gap-3 text-[15px]">
              <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              {problem}
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button onClick={onClose}>Got it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
