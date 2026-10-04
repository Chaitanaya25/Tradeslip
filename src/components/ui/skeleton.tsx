import { cn } from "@/lib/utils";

/** Quiet placeholder block while a card loads. No shimmer: DESIGN.md keeps motion subtle. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden="true" data-slot="skeleton" className={cn("animate-pulse rounded-md bg-surface-muted", className)} {...props} />;
}
