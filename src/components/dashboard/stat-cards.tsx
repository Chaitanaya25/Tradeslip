import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, CreditCard, FileText, MessageSquare } from "lucide-react";
import { CardError } from "@/components/dashboard/card-states";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { compareLabel, percentChange } from "@/lib/dashboard";
import { loadDashboardStats } from "@/lib/dashboard-queries";
import { formatMoney } from "@/lib/money";
import { REGIONS } from "@/lib/region";
import type { Business } from "@/lib/supabase/tables";

function StatCard({ icon, label, value, valueClass, children, tone }: { icon: React.ReactNode; label: string; value: string; valueClass: string; children: React.ReactNode; tone?: "red" }) {
  return (
    <Card className="flex items-start gap-4 p-5">
      <IconTile variant={tone === "red" ? "red" : "default"}>{icon}</IconTile>
      <div className="min-w-0">
        <p className="text-body text-text-muted">{label}</p>
        <p className={`tabular text-stat truncate ${valueClass}`}>{value}</p>
        <div className="text-small text-text-muted">{children}</div>
      </div>
    </Card>
  );
}

/** The four stat cards, all from dashboard_stats (the same definitions as the invoice pages). */
export async function StatCards({ business }: { business: Business }) {
  let stats;
  try {
    stats = await loadDashboardStats(business);
  } catch {
    return (
      <>
        {["Owed to you", "Awaiting reply", "Paid this month", "Overdue"].map((t) => (
          <CardError key={t} title={t} />
        ))}
      </>
    );
  }

  const locale = REGIONS[business.country].locale;
  const money = (cents: number) => formatMoney(cents, business.currency, locale);
  const pct = percentChange(stats.paidThisMonthCents, stats.paidLastMonthCents);
  const compare = compareLabel(pct);
  const quotesWord = stats.awaitingCount === 1 ? "quote" : "quotes";

  return (
    <>
      <StatCard icon={<FileText />} label="Owed to you" value={money(stats.owedCents)} valueClass="text-accent">
        {stats.owedCount === 1 ? "1 invoice" : `${stats.owedCount} invoices`}
      </StatCard>

      <StatCard icon={<MessageSquare />} label="Awaiting reply" value={`${stats.awaitingCount} ${quotesWord}`} valueClass="text-text">
        Total value {money(stats.awaitingValueCents)}
      </StatCard>

      <StatCard icon={<CreditCard />} label="Paid this month" value={money(stats.paidThisMonthCents)} valueClass="text-accent">
        {pct === null ? (
          <span>&nbsp;</span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-0.5 font-medium ${pct >= 0 ? "text-status-good-text" : "text-status-bad-text"}`}>
              {pct >= 0 ? <ArrowUp className="size-3.5" strokeWidth={2} aria-hidden="true" /> : <ArrowDown className="size-3.5" strokeWidth={2} aria-hidden="true" />}
              {Math.abs(pct)}%
            </span>
            <span className="sr-only">{compare}</span>
            <span aria-hidden="true">{pct === 0 ? "same as last month" : "vs last month"}</span>
          </span>
        )}
      </StatCard>

      {stats.overdueCount === 0 ? (
        <StatCard icon={<CircleCheck />} label="Overdue" value="Nothing overdue" valueClass="text-text !text-[22px] !leading-9">
          You&apos;re up to date.
        </StatCard>
      ) : (
        <StatCard icon={<CircleAlert />} tone="red" label="Overdue" value={`${stats.overdueCount} ${stats.overdueCount === 1 ? "invoice" : "invoices"}`} valueClass="text-accent">
          Total {money(stats.overdueCents)}
        </StatCard>
      )}
    </>
  );
}
