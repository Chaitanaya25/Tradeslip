import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder while a dashboard card loads. */
export function CardSkeleton({ title, rows = 3, className }: { title?: string; rows?: number; className?: string }) {
  return (
    <Card className={className} aria-busy="true" aria-live="polite">
      {title ? <h2 className="text-h2 mb-5">{title}</h2> : <Skeleton className="mb-5 h-6 w-40" />}
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </Card>
  );
}

export function StatSkeleton() {
  return (
    <Card className="flex items-center gap-4 p-5" aria-busy="true">
      <Skeleton className="size-10" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
      <span className="sr-only">Loading</span>
    </Card>
  );
}

/** One card failed to load: say so inside the card, leave the rest of the page alone. */
export function CardError({ title, className }: { title: string; className?: string }) {
  return (
    <Card className={className}>
      <h2 className="text-h2 mb-3">{title}</h2>
      <p role="alert" className="text-body flex items-start gap-2 text-text-muted">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        We couldn&apos;t load this just now. Refresh the page to try again.
      </p>
    </Card>
  );
}
