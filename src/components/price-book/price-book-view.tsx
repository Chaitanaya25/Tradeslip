"use client";

import { useMemo, useState, useTransition } from "react";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { PriceItemSheet, type PriceItemRow } from "@/components/price-book/price-item-sheet";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/money";
import { formatBpsAsPercent } from "@/lib/money-input";
import { TYPE_LABELS, UNIT_LABELS } from "@/lib/schemas/price-item";
import { setPriceItemArchived } from "@/server/actions/price-items";

// Reuse the existing pill colours rather than adding new ones.
const TYPE_PILL: Record<PriceItemRow["type"], Status> = {
  labour: "viewed",
  material: "sent",
  fee: "awaiting",
};

function RowMenu({ item, onEdit }: { item: PriceItemRow; onEdit: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function toggleArchived() {
    startTransition(async () => {
      const result = await setPriceItemArchived(item.id, !item.archived);
      if (result.ok) toast.success(item.archived ? "Item restored." : "Item archived.");
      else toast.error(result.message);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="icon" className="size-9 border-transparent bg-transparent" aria-label={`Actions for ${item.name}`} disabled={pending}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={toggleArchived}>
          {item.archived ? <ArchiveRestore /> : <Archive />}
          {item.archived ? "Restore" : "Archive"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PriceBookView({
  items,
  currency,
  locale,
}: {
  items: PriceItemRow[];
  currency: string;
  locale: string;
}) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PriceItemRow | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => (showArchived || !i.archived) && (!q || i.name.toLowerCase().includes(q)));
  }, [items, query, showArchived]);

  function openAdd() {
    setEditing(null);
    setSheetOpen(true);
  }
  function openEdit(item: PriceItemRow) {
    setEditing(item);
    setSheetOpen(true);
  }

  const archivedCount = items.filter((i) => i.archived).length;

  return (
    <>
      <PageHeader
        title="Price Book"
        description="The prices behind every quote. Voice drafts use these rates."
        actions={
          items.length > 0 ? (
            <Button onClick={openAdd}>
              <Plus /> Add item
            </Button>
          ) : null
        }
      />

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-card">
          <p className="text-body text-text-muted">Your price book is empty.</p>
          <Button className="mt-4" onClick={openAdd}>
            <Plus /> Add your first item
          </Button>
        </div>
      ) : (
        <TableCard>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your price book..."
                aria-label="Search price book"
                className="pl-10"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-3">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived" />
              <span className="text-body-strong">
                Show archived{archivedCount > 0 ? <span className="text-small ml-1.5 font-normal text-text-muted">({archivedCount})</span> : null}
              </span>
            </label>
          </div>

          {visible.length === 0 ? (
            <p className="text-body px-6 py-8 text-text-muted">
              {query.trim()
                ? `No items match "${query.trim()}".`
                : "No active items. Turn on Show archived to see archived ones."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="h-11 hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead numeric>Rate</TableHead>
                  <TableHead numeric>Markup</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((item) => (
                  <TableRow key={item.id} className={item.archived ? "text-text-muted" : undefined}>
                    <TableCell>
                      <button type="button" onClick={() => openEdit(item)} className="text-body-strong rounded-md text-left hover:underline">
                        {item.name}
                      </button>
                      {item.archived ? <span className="text-small ml-2 text-text-muted">Archived</span> : null}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={TYPE_PILL[item.type]}>{TYPE_LABELS[item.type]}</StatusPill>
                    </TableCell>
                    <TableCell>{UNIT_LABELS[item.unit]}</TableCell>
                    <TableCell numeric>{formatMoney(item.rate_cents, currency, locale)}</TableCell>
                    <TableCell numeric className="text-text-muted">
                      {item.type === "material" && item.markup_bps > 0 ? `${formatBpsAsPercent(item.markup_bps)}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <RowMenu item={item} onEdit={() => openEdit(item)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      )}

      <PriceItemSheet open={sheetOpen} onOpenChange={setSheetOpen} item={editing} currency={currency} />
    </>
  );
}
