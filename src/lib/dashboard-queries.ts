import "server-only";
import { buildInvoiceSeries, type ChartPoint } from "@/lib/chart-data";
import { buildNeedsAttention, type AttentionInvoice, type AttentionItem, type AttentionQuote } from "@/lib/dashboard";
import { defaultValidUntil, todayInTimezone } from "@/lib/quote-calc";
import { derivedStatus, remainingCents, type StoredInvoiceStatus } from "@/lib/invoice-calc";
import { getInvoiceStats } from "@/lib/invoice-stats";
import { formatMoney } from "@/lib/money";
import { REGIONS, quoteWord } from "@/lib/region";
import { effectiveStatus } from "@/lib/quote-send";
import { zonedToUtc } from "@/lib/schedule";
import { buildPublicInvoiceUrl, buildPublicUrl } from "@/lib/share-links";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/supabase/tables";
import type { Status } from "@/components/ui/status-pill";

/** One loader per dashboard card, so one failing query never blanks the page. Server only; RLS applies. */

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export const todayFor = (business: Business) => todayInTimezone(business.timezone);

export async function loadDashboardStats(business: Business) {
  const supabase = await createClient();
  const stats = await getInvoiceStats(supabase, business.id);
  if (!stats) throw new Error("dashboard_stats failed");
  return stats;
}

export type RecentRow = {
  key: string;
  kind: "quote" | "invoice";
  href: string;
  customer: string;
  address: string;
  job: string;
  amountCents: number;
  status: Status;
  updatedAt: string;
};

/** Latest quotes and invoices merged by update time, each with its real derived status. */
export async function loadRecentActivity(business: Business, limit = 8): Promise<RecentRow[]> {
  const supabase = await createClient();
  const today = todayFor(business);
  const [quotes, invoices] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, number, title, status, total_cents, valid_until, updated_at, customers(name, address_line1, city)")
      .eq("business_id", business.id)
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("invoices")
      .select("id, number, title, status, total_cents, amount_paid_cents, due_date, updated_at, customers(name, address_line1, city)")
      .eq("business_id", business.id)
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);
  if (quotes.error || invoices.error) throw new Error("recent activity failed");

  const rows: RecentRow[] = [
    ...(quotes.data ?? []).map((q) => ({
      key: `q:${q.id}`,
      kind: "quote" as const,
      href: `/quotes/${q.id}`,
      customer: q.customers?.name ?? "No customer",
      address: [q.customers?.address_line1, q.customers?.city].filter(Boolean).join(", "),
      job: q.title || `${quoteWord(business.country)} #${business.quote_prefix}${q.number}`,
      amountCents: q.total_cents,
      status: effectiveStatus(q.status, q.valid_until, today) as Status,
      updatedAt: q.updated_at,
    })),
    ...(invoices.data ?? []).map((i) => ({
      key: `i:${i.id}`,
      kind: "invoice" as const,
      href: `/invoices/${i.id}`,
      customer: i.customers?.name ?? "No customer",
      address: [i.customers?.address_line1, i.customers?.city].filter(Boolean).join(", "),
      job: i.title || `Invoice #${business.invoice_prefix}${i.number}`,
      amountCents: i.total_cents,
      status: derivedStatus(
        i.status as StoredInvoiceStatus,
        i.due_date,
        today,
        remainingCents(i.total_cents, i.amount_paid_cents),
        i.amount_paid_cents,
      ) as Status,
      updatedAt: i.updated_at,
    })),
  ];
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

/** The Needs attention list, built by the same pure function the tests cover. */
export async function loadNeedsAttention(business: Business): Promise<AttentionItem[]> {
  const supabase = await createClient();
  const today = todayFor(business);
  const locale = REGIONS[business.country].locale;
  const word = quoteWord(business.country);

  const [invoices, quotes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, number, status, due_date, total_cents, amount_paid_cents, public_token, customers(name, email, phone)")
      .eq("business_id", business.id)
      .in("status", ["sent", "viewed"])
      .lt("due_date", today)
      .order("due_date")
      .limit(50),
    supabase
      .from("quotes")
      .select("id, number, status, valid_until, sent_at, total_cents, public_token, customers(name, email, phone)")
      .eq("business_id", business.id)
      .in("status", ["sent", "viewed", "accepted"])
      .order("sent_at", { ascending: true, nullsFirst: false })
      .limit(100),
  ]);
  if (invoices.error || quotes.error) throw new Error("needs attention failed");

  const acceptedIds = (quotes.data ?? []).filter((q) => q.status === "accepted").map((q) => q.id);
  let invoiced = new Set<string>();
  if (acceptedIds.length > 0) {
    const { data } = await supabase.from("invoices").select("quote_id").eq("business_id", business.id).in("quote_id", acceptedIds).neq("status", "void");
    invoiced = new Set((data ?? []).map((r) => r.quote_id as string));
  }

  const customer = (c: { name: string | null; email: string | null; phone: string | null } | null) => ({
    name: c?.name ?? null,
    email: c?.email ?? null,
    phone: c?.phone ?? null,
  });
  const money = (cents: number) => formatMoney(cents, business.currency, locale);

  return buildNeedsAttention({
    invoices: (invoices.data ?? []).map(
      (i): AttentionInvoice => ({
        id: i.id,
        number: i.number,
        status: i.status as StoredInvoiceStatus,
        dueDate: i.due_date,
        totalCents: i.total_cents,
        amountPaidCents: i.amount_paid_cents,
        customer: customer(i.customers),
        link: buildPublicInvoiceUrl(appUrl(), i.public_token),
      }),
    ),
    quotes: (quotes.data ?? []).map(
      (q): AttentionQuote => ({
        id: q.id,
        number: q.number,
        status: q.status,
        validUntil: q.valid_until,
        sentAt: q.sent_at,
        totalCents: q.total_cents,
        customer: customer(q.customers),
        link: q.status === "accepted" ? null : buildPublicUrl(appUrl(), q.public_token),
      }),
    ),
    quotesWithInvoice: invoiced,
    today,
    timeZone: business.timezone,
    quoteWord: word,
    money,
    quoteLabel: (n) => `${business.quote_prefix}${n}`,
    invoiceLabel: (n) => `${business.invoice_prefix}${n}`,
  });
}

/** Twelve months of paid vs outstanding; the chart slices it to 3 / 6 / 12. */
export async function loadInvoiceChart(business: Business): Promise<ChartPoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("monthly_invoice_totals", { p_business_id: business.id, p_months: 12 });
  if (error) throw new Error("monthly_invoice_totals failed");
  return buildInvoiceSeries(data ?? [], 12, todayFor(business), REGIONS[business.country].locale);
}

export type ScheduleRow = { id: string; time: string; scheduledFor: string; title: string; address: string; past: boolean };

/** Accepted quotes scheduled for today in the business timezone. Empty means the card is hidden. */
export async function loadTodaysSchedule(business: Business): Promise<ScheduleRow[]> {
  const supabase = await createClient();
  const today = todayFor(business);
  const start = zonedToUtc(today, "00:00", business.timezone);
  const end = zonedToUtc(defaultValidUntil(today, 1), "00:00", business.timezone);
  const { data, error } = await supabase
    .from("quotes")
    .select("id, number, title, scheduled_for, customers(name, address_line1, city)")
    .eq("business_id", business.id)
    .eq("status", "accepted")
    .gte("scheduled_for", start.toISOString())
    .lt("scheduled_for", end.toISOString())
    .order("scheduled_for");
  if (error) throw new Error("schedule failed");

  const now = Date.now();
  return (data ?? []).map((q) => ({
    id: q.id,
    scheduledFor: q.scheduled_for as string,
    time: new Intl.DateTimeFormat(REGIONS[business.country].locale, { timeZone: business.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(q.scheduled_for as string)),
    title: q.title || q.customers?.name || `${quoteWord(business.country)} #${business.quote_prefix}${q.number}`,
    address: [q.customers?.address_line1, q.customers?.city].filter(Boolean).join(", "),
    past: new Date(q.scheduled_for as string).getTime() < now,
  }));
}

export type Checklist = {
  isNew: boolean;
  steps: { key: "price-book" | "first-quote" | "payment-link"; label: string; href: string; done: boolean }[];
};

/** Brand-new business: nothing quoted or invoiced yet. The steps check themselves off from real data. */
export async function loadChecklist(business: Business): Promise<Checklist> {
  const supabase = await createClient();
  const count = (table: "price_items" | "quotes" | "invoices") =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("business_id", business.id);
  const [items, quotes, invoices] = await Promise.all([count("price_items"), count("quotes"), count("invoices")]);
  if (items.error || quotes.error || invoices.error) throw new Error("checklist failed");

  return {
    isNew: (quotes.count ?? 0) === 0 && (invoices.count ?? 0) === 0,
    steps: [
      { key: "price-book", label: "Add your prices to the price book", href: "/price-book", done: (items.count ?? 0) > 0 },
      { key: "first-quote", label: "Create your first quote by voice", href: "/quotes/new?record=1", done: (quotes.count ?? 0) > 0 },
      { key: "payment-link", label: "Connect a payment link in Settings", href: "/settings/payment-link", done: Boolean(business.payment_link_url) },
    ],
  };
}
