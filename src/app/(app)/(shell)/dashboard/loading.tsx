import { CardSkeleton, StatSkeleton } from "@/components/dashboard/card-states";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown while the page shell resolves; each card then streams in on its own. */
export default function DashboardLoading() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-44" />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <CardSkeleton rows={5} className="lg:col-span-2" />
          <CardSkeleton rows={3} />
        </div>
      </div>
    </>
  );
}
