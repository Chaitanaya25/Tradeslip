"use client";

import { useState, useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmUnsubscribe } from "@/server/actions/unsubscribe";

/** One button. After it, a calm confirmation; nothing about the address is shown. */
export function UnsubscribeForm({ token, businessName }: { token: string; businessName: string }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ status: "idle" } | { status: "done" } | { status: "error"; message: string }>({ status: "idle" });

  if (state.status === "done") {
    return (
      <div role="status" className="flex gap-3 rounded-lg bg-status-good-bg p-4 text-status-good-text">
        <CircleCheck className="mt-0.5 size-6 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <div>
          <p className="text-[17px] font-semibold">You won&apos;t get these reminders any more</p>
          <p className="text-[15px]">{businessName} won&apos;t send you automatic reminders. You can close this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        className="h-[52px] w-full text-[17px]"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await confirmUnsubscribe(token);
            setState(result.ok ? { status: "done" } : { status: "error", message: result.message });
          })
        }
      >
        {pending ? "Saving..." : "Yes, stop reminders"}
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="text-[15px] text-destructive">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
