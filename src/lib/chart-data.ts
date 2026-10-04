/** Series for the invoices bar chart, from monthly_invoice_totals(). Months with no invoices are zero, not missing. */

export type MonthlyRow = { month: string; paid_cents: number | string; outstanding_cents: number | string };

export type ChartPoint = {
  /** First day of the month, yyyy-mm-01. */
  month: string;
  /** "May" (per locale). */
  label: string;
  paid: number;
  outstanding: number;
};

function monthKey(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** The first of the month `back` months before `today`'s month, as yyyy-mm-01. */
export function monthsAgo(today: string, back: number): string {
  const [y, m] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10);
}

/** Last `months` months ending with today's month, oldest first, empty months filled with zero. */
export function buildInvoiceSeries(rows: readonly MonthlyRow[], months: number, today: string, locale: string): ChartPoint[] {
  const byMonth = new Map(rows.map((r) => [monthKey(r.month), r]));
  const fmt = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short" });
  const points: ChartPoint[] = [];
  for (let back = Math.max(months, 1) - 1; back >= 0; back -= 1) {
    const month = monthsAgo(today, back);
    const row = byMonth.get(month);
    points.push({
      month,
      label: fmt.format(new Date(`${month}T00:00:00Z`)),
      paid: Number(row?.paid_cents ?? 0),
      outstanding: Number(row?.outstanding_cents ?? 0),
    });
  }
  return points;
}

export function hasInvoiceData(points: readonly ChartPoint[]): boolean {
  return points.some((p) => p.paid > 0 || p.outstanding > 0);
}
