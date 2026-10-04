"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { hasInvoiceData, type ChartPoint } from "@/lib/chart-data";
import { formatMoney } from "@/lib/money";

const RANGES = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
] as const;

/** Paid (grey) vs outstanding (accent) per month. Twelve months arrive; the select slices them. */
export function InvoicesChart({ points, currency, locale }: { points: ChartPoint[]; currency: string; locale: string }) {
  const [range, setRange] = useState("6");
  const shown = useMemo(() => points.slice(-Number(range)), [points, range]);
  const compact = (cents: number) => formatMoney(cents, currency, locale).replace(/\.00$/, "");
  const summary = shown.map((p) => `${p.label}: paid ${compact(p.paid)}, outstanding ${compact(p.outstanding)}`).join(". ");

  return (
    <Card className="lg:col-span-1">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-h2">Invoices</h2>
        <div className="w-44">
          <SelectField id="chart-range" value={range} onChange={setRange} options={RANGES} />
        </div>
      </div>

      {!hasInvoiceData(points) ? (
        <p className="text-body text-text-muted">No invoice data yet. Send your first invoice and it will show here.</p>
      ) : (
        <>
          <div role="img" aria-label={`Invoices paid and outstanding by month. ${summary}`} className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shown.map((p) => ({ ...p, paid: p.paid / 100, outstanding: p.outstanding / 100 }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--text-muted)" }} />
                <YAxis
                  width={52}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--text-muted)" }}
                  tickFormatter={(v: number) => compact(Math.round(v) * 100)}
                />
                <Bar dataKey="paid" stackId="a" fill="#D6D3CD" isAnimationActive={false} />
                <Bar dataKey="outstanding" stackId="a" fill="var(--accent)" isAnimationActive={false} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="text-small mt-3 flex items-center justify-center gap-5 text-text-muted" aria-hidden="true">
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: "#D6D3CD" }} /> Paid
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-accent" /> Outstanding
            </li>
          </ul>
          <table className="sr-only">
            <caption>Invoices paid and outstanding by month</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Paid</th>
                <th scope="col">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.month}>
                  <th scope="row">{p.label}</th>
                  <td>{formatMoney(p.paid, currency, locale)}</td>
                  <td>{formatMoney(p.outstanding, currency, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
