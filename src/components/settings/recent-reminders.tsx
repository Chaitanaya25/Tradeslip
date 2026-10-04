import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { KIND_LABELS, LOG_STATUS_LABELS } from "@/lib/reminder-messages";

type Row = {
  id: string;
  created_at: string;
  entity_type: "quote" | "invoice";
  entity_id: string;
  kind: keyof typeof KIND_LABELS;
  status: keyof typeof LOG_STATUS_LABELS;
  reason: string | null;
  number: number | null;
};

/** The last 20 reminder attempts, so you can see what was sent (and what was not). */
export function RecentReminders({ rows, locale, timezone, quotePrefix, invoicePrefix }: { rows: Row[]; locale: string; timezone: string; quotePrefix: string; invoicePrefix: string }) {
  return (
    <Card>
      <h2 className="text-h2 mb-1">Recent reminders</h2>
      <p className="text-small mb-4 text-text-muted">The last 20 automatic and manual reminders.</p>
      {rows.length === 0 ? (
        <p className="text-body text-text-muted">No reminders yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const href = r.entity_type === "quote" ? `/quotes/${r.entity_id}` : `/invoices/${r.entity_id}`;
            const label = `${r.entity_type === "quote" ? quotePrefix : invoicePrefix}${r.number ?? ""}`;
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-body-strong">{KIND_LABELS[r.kind]}</p>
                  <p className="text-small text-text-muted">
                    <Link href={href} className="hover:underline">
                      {r.entity_type === "quote" ? "Quote" : "Invoice"} #{label}
                    </Link>{" "}
                    · <span className="tabular">{formatDateTime(r.created_at, locale, timezone)}</span>
                  </p>
                </div>
                <p className={`text-label ${r.status === "sent" ? "text-status-good-text" : r.status === "failed" ? "text-status-bad-text" : "text-text-muted"}`}>
                  {LOG_STATUS_LABELS[r.status]}
                  {r.status !== "sent" && r.reason ? ` (${r.reason.replace(/_/g, " ")})` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
