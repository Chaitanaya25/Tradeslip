"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, MoreHorizontal, Mic, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteDraftQuote, duplicateQuote } from "@/server/actions/quotes";

export type QuoteRow = {
  id: string;
  number: number;
  title: string | null;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  total_cents: number;
  created_at: string;
  sent_at: string | null;
  customers: { name: string; address_line1: string | null; city: string | null } | null;
};

const FILTERS = ["all", "draft", "sent", "viewed", "accepted", "declined", "expired"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export function QuotesList({
  quotes,
  currency,
  locale,
  timezone,
  docPrefix,
  quoteWord,
}: {
  quotes: QuoteRow[];
  currency: string;
  locale: string;
  timezone: string;
  docPrefix: string;
  quoteWord: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<QuoteRow | null>(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: quotes.length, draft: 0, sent: 0, viewed: 0, accepted: 0, declined: 0, expired: 0 };
    for (const q of quotes) c[q.status] += 1;
    return c;
  }, [quotes]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return quotes.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!q) return true;
      const number = `${docPrefix}${row.number}`.toLowerCase();
      return (row.customers?.name ?? "").toLowerCase().includes(q) || number.includes(q);
    });
  }, [quotes, filter, query, docPrefix]);

  function duplicate(row: QuoteRow) {
    startTransition(async () => {
      const result = await duplicateQuote(row.id);
      if (!result.ok) return void toast.error(result.message);
      toast.success(`Duplicated as ${quoteWord.toLowerCase()} #${docPrefix}${result.number}.`);
      router.push(`/quotes/${result.quoteId}/edit`);
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const row = deleting;
    startTransition(async () => {
      const result = await deleteDraftQuote(row.id);
      setDeleting(null);
      if (result.ok) toast.success("Draft deleted.");
      else toast.error(result.message);
    });
  }

  return (
    <>
      <PageHeader
        title="Quotes"
        description={quotes.length > 0 ? `${quotes.length} in total, newest first.` : undefined}
        actions={
          <>
            <Button asChild>
              <Link href="/quotes/new">
                <Plus /> New {quoteWord.toLowerCase()}
              </Link>
            </Button>
            <Button asChild variant="icon">
              <Link href="/quotes/new?record=1" aria-label="Record a voice quote">
                <Mic />
              </Link>
            </Button>
          </>
        }
      />

      {quotes.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
          <p className="text-body text-text-muted">No {quoteWord.toLowerCase()}s yet.</p>
          <Button asChild className="mt-4">
            <Link href="/quotes/new">
              <Plus /> Create your first {quoteWord.toLowerCase()}
            </Link>
          </Button>
        </div>
      ) : (
        <TableCard>
          <div className="space-y-4 border-b border-border px-6 py-4">
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by customer or number"
                aria-label="Search quotes"
                className="pl-10"
              />
            </div>
            <div role="group" aria-label="Filter by status" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "text-label flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 transition-colors duration-150",
                    filter === f
                      ? "border-accent-border bg-accent-soft text-accent"
                      : "border-border-strong bg-surface text-text hover:bg-surface-muted",
                  )}
                >
                  {FILTER_LABELS[f]}
                  <span className={cn("tabular font-normal", filter === f ? "text-accent" : "text-text-muted")}>{counts[f]}</span>
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="text-body px-6 py-8 text-text-muted">
              {query.trim() ? `No ${quoteWord.toLowerCase()}s match "${query.trim()}".` : `No ${FILTER_LABELS[filter].toLowerCase()} ${quoteWord.toLowerCase()}s.`}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="h-11 hover:bg-transparent">
                  <TableHead>Customer</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead numeric>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => {
                  const address = [row.customers?.address_line1, row.customers?.city].filter(Boolean).join(", ");
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/quotes/${row.id}`)}
                    >
                      <TableCell>
                        <Link
                          href={`/quotes/${row.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-body-strong block rounded-md hover:underline"
                        >
                          {row.customers?.name ?? "No customer"}
                        </Link>
                        <span className="text-small block text-text-muted">{address || `#${docPrefix}${row.number}`}</span>
                      </TableCell>
                      <TableCell>{row.title || <span className="text-text-muted">#{docPrefix}{row.number}</span>}</TableCell>
                      <TableCell numeric>{formatMoney(row.total_cents, currency, locale)}</TableCell>
                      <TableCell>
                        <StatusPill status={row.status as Status} />
                      </TableCell>
                      <TableCell className="tabular text-text-muted">
                        {formatShortDate(row.sent_at ?? row.created_at, locale, timezone)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="icon"
                              className="size-9 border-transparent bg-transparent"
                              aria-label={`Actions for ${quoteWord.toLowerCase()} ${row.number}`}
                              disabled={pending}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => router.push(`/quotes/${row.id}`)}>
                              <ExternalLink /> Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => duplicate(row)}>
                              <Copy /> Duplicate
                            </DropdownMenuItem>
                            {row.status === "draft" ? (
                              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                                <Trash2 /> Delete draft
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TableCard>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this draft?"
        description="The draft and its photos will be removed. This can't be undone."
        confirmLabel="Delete draft"
        pending={pending}
        onConfirm={confirmDelete}
      />
    </>
  );
}
