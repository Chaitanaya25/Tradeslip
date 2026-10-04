import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Checklist } from "@/lib/dashboard-queries";

/** Brand-new business: three first steps, each ticked off from real data. */
export function GetStarted({ steps }: { steps: Checklist["steps"] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="lg:col-span-3">
      <h2 className="text-h2">Let&apos;s get you set up</h2>
      <p className="text-body mb-5 text-text-muted">
        {done} of {steps.length} done. Your numbers and activity will show here once you send your first quote.
      </p>
      <ol className="divide-y divide-border rounded-lg border border-border">
        {steps.map((step, i) => (
          <li key={step.key}>
            <Link href={step.href} className="flex items-center gap-4 px-4 py-4 transition-colors duration-150 hover:bg-surface-muted">
              {step.done ? (
                <CircleCheck className="size-6 shrink-0 text-status-good-text" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <span className="text-label flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-muted" aria-hidden="true">
                  {i + 1}
                </span>
              )}
              <span className={`text-body-strong flex-1 ${step.done ? "text-text-muted line-through" : ""}`}>{step.label}</span>
              <span className="sr-only">{step.done ? "Done" : "Not done yet"}</span>
              {!step.done ? <ArrowRight className="size-4 shrink-0 text-accent" strokeWidth={1.5} aria-hidden="true" /> : null}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
