import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Owed, overdue and paid-this-month for the dashboard (Phase 7), read from dashboard_stats().
 * The SQL uses the same derived-status rule as `derivedStatus` / `summariseInvoices` in
 * invoice-calc.ts: overdue = sent or viewed, money remaining, due before today (business timezone);
 * paid-this-month = payments dated in the month, void invoices excluded.
 */
export async function getInvoiceStats(supabase: SupabaseClient<Database>, businessId: string) {
  const { data, error } = await supabase.rpc("dashboard_stats", { p_business_id: businessId });
  if (error || !data?.[0]) return null;
  const r = data[0];
  return {
    owedCents: Number(r.owed_cents),
    owedCount: r.owed_count,
    overdueCents: Number(r.overdue_cents),
    overdueCount: r.overdue_count,
    paidThisMonthCents: Number(r.paid_this_month_cents),
    paidLastMonthCents: Number(r.paid_last_month_cents),
    awaitingCount: r.awaiting_count,
    awaitingValueCents: Number(r.awaiting_value_cents),
  };
}
