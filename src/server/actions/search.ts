"use server";

import { failure, type ActionResult } from "@/lib/action-result";
import { derivedStatus, remainingCents, type StoredInvoiceStatus } from "@/lib/invoice-calc";
import { todayInTimezone } from "@/lib/quote-calc";
import { effectiveStatus } from "@/lib/quote-send";
import { PER_KIND_LIMIT, isSearchable, normaliseQuery, rankResults, type SearchKind } from "@/lib/search";
import { actionBusinessContext } from "./context";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  /** Pill key: derived invoice status, effective quote status, or null for customers. */
  status: string | null;
  amountCents: number | null;
  archived: boolean;
};

/**
 * Global search over the signed-in user's own business (customers, quotes, invoices).
 * RLS applies: global_search is SECURITY INVOKER and runs as the user.
 */
export async function searchAll(raw: string): Promise<ActionResult<{ hits: SearchHit[] }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;

  const query = normaliseQuery(raw);
  if (!isSearchable(query)) return { ok: true, hits: [] };

  const { data, error } = await ctx.supabase.rpc("global_search", { p_business_id: ctx.business.id, p_query: query, p_limit: PER_KIND_LIMIT });
  if (error) return failure("Search isn't available just now. Try again.");

  const today = todayInTimezone(ctx.business.timezone);
  const rows = (data ?? []).map((r) => ({ ...r, rank: Number(r.rank) }));
  const grouped = rankResults(rows);

  const hits: SearchHit[] = [...grouped.customer, ...grouped.quote, ...grouped.invoice].map((r) => {
    let status: string | null = null;
    if (r.kind === "quote" && r.status) status = effectiveStatus(r.status as never, r.valid_until, today);
    if (r.kind === "invoice" && r.status) {
      const total = r.amount_cents ?? 0;
      const paid = r.amount_paid_cents ?? 0;
      status = derivedStatus(r.status as StoredInvoiceStatus, r.due_date ?? today, today, remainingCents(total, paid), paid);
    }
    return {
      kind: r.kind,
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      href: r.kind === "customer" ? `/customers/${r.id}` : r.kind === "quote" ? `/quotes/${r.id}` : `/invoices/${r.id}`,
      status,
      amountCents: r.kind === "customer" ? null : r.amount_cents,
      archived: r.archived,
    };
  });
  return { ok: true, hits };
}
