import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CardError } from "@/components/dashboard/card-states";
import { loadTodaysSchedule } from "@/lib/dashboard-queries";
import type { Business } from "@/lib/supabase/tables";
import Link from "next/link";

/** Accepted jobs scheduled for today. Hidden entirely when there are none. */
export async function TodaysSchedule({ business }: { business: Business }) {
  let rows;
  try {
    rows = await loadTodaysSchedule(business);
  } catch {
    return <CardError title="Today's schedule" />;
  }
  if (rows.length === 0) return null;

  return (
    <Card className="lg:col-span-1">
      <h2 className="text-h2 mb-5">Today&apos;s schedule</h2>
      <ol>
        {rows.map((row, i) => (
          <li key={row.id} className="flex gap-3">
            <p className="text-small tabular w-[72px] shrink-0 pt-1 text-text-muted">{row.time}</p>
            <div className="relative flex shrink-0 flex-col items-center">
              <span className={`mt-2 size-2.5 rounded-full ${row.past ? "bg-border-strong" : "bg-accent"}`} aria-hidden="true" />
              {i < rows.length - 1 ? <span className="absolute top-5 h-[calc(100%-8px)] w-px bg-border" aria-hidden="true" /> : null}
            </div>
            <div className={`min-w-0 flex-1 ${i < rows.length - 1 ? "pb-5" : ""}`}>
              <Link href={`/quotes/${row.id}`} className="text-body-strong rounded-md hover:underline">
                {row.title}
              </Link>
              {row.address ? (
                <p className="text-small flex items-center gap-1.5 text-text-muted">
                  <MapPin className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" /> {row.address}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
