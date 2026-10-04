import { Suspense } from "react";
import { CardError, CardSkeleton } from "@/components/dashboard/card-states";
import { GetStarted } from "@/components/dashboard/get-started";
import { InvoicesChart } from "@/components/dashboard/invoices-chart";
import { NeedsAttention } from "@/components/dashboard/needs-attention";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { loadChecklist, loadInvoiceChart, loadNeedsAttention, loadRecentActivity } from "@/lib/dashboard-queries";
import { REGIONS, quoteWord } from "@/lib/region";
import type { Business } from "@/lib/supabase/tables";

/** Async server sections: each loads its own data and handles its own failure. */

async function RecentSection({ business }: { business: Business }) {
  let rows;
  try {
    rows = await loadRecentActivity(business);
  } catch {
    return <CardError title="Recent activity" className="lg:col-span-2" />;
  }
  return (
    <RecentActivity
      rows={rows}
      currency={business.currency}
      locale={REGIONS[business.country].locale}
      timezone={business.timezone}
      quoteWord={quoteWord(business.country)}
    />
  );
}

async function AttentionSection({ business }: { business: Business }) {
  let items;
  try {
    items = await loadNeedsAttention(business);
  } catch {
    return <CardError title="Needs attention" />;
  }
  return <NeedsAttention items={items} quoteWord={quoteWord(business.country)} />;
}

export async function ChartSection({ business }: { business: Business }) {
  let points;
  try {
    points = await loadInvoiceChart(business);
  } catch {
    return <CardError title="Invoices" />;
  }
  return <InvoicesChart points={points} currency={business.currency} locale={REGIONS[business.country].locale} />;
}

/** Recent activity + Needs attention, or the first-steps card for a business with nothing yet. */
export async function MainRow({ business }: { business: Business }) {
  let checklist;
  try {
    checklist = await loadChecklist(business);
  } catch {
    checklist = null;
  }
  if (checklist?.isNew) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <GetStarted steps={checklist.steps} />
      </div>
    );
  }
  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <Suspense fallback={<CardSkeleton title="Recent activity" rows={5} className="lg:col-span-2" />}>
        <RecentSection business={business} />
      </Suspense>
      <Suspense fallback={<CardSkeleton title="Needs attention" rows={3} />}>
        <AttentionSection business={business} />
      </Suspense>
    </div>
  );
}
