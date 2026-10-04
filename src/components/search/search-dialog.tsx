"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { FileText, Receipt, Search, Users } from "lucide-react";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { formatMoney } from "@/lib/money";
import { MIN_QUERY_LENGTH, isSearchable, normaliseQuery, type SearchKind } from "@/lib/search";
import { cn } from "@/lib/utils";
import { searchAll, type SearchHit } from "@/server/actions/search";

const DEBOUNCE_MS = 250;
const GROUPS: { kind: SearchKind; label: string; icon: typeof Users }[] = [
  { kind: "customer", label: "Customers", icon: Users },
  { kind: "quote", label: "Quotes", icon: FileText },
  { kind: "invoice", label: "Invoices", icon: Receipt },
];

type State = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; hits: SearchHit[] };

/**
 * Command-palette style search. Debounced, minimum 2 characters, stale responses ignored,
 * arrow keys + Enter, Escape closes. Nothing is stored. Combobox + listbox semantics.
 */
export function SearchDialog({ open, onOpenChange, currency, locale }: { open: boolean; onOpenChange: (open: boolean) => void; currency: string; locale: string }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [active, setActive] = useState(0);
  const requestId = useRef(0);

  const hits = state.status === "done" ? state.hits : [];

  // Reset when the dialog closes, so nothing from the last search lingers.
  useEffect(() => {
    if (open) return;
    requestId.current += 1;
    const t = setTimeout(() => {
      setQuery("");
      setState({ status: "idle" });
      setActive(0);
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = normaliseQuery(query);
    const id = ++requestId.current;
    if (!isSearchable(q)) {
      const t = setTimeout(() => setState({ status: "idle" }), 0);
      return () => clearTimeout(t);
    }
    const timer = setTimeout(async () => {
      setState({ status: "loading" });
      const result = await searchAll(q);
      if (id !== requestId.current) return; // a newer search started: ignore this answer
      if (!result.ok) return setState({ status: "error", message: result.message });
      setState({ status: "done", hits: result.hits });
      setActive(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  function go(hit: SearchHit) {
    onOpenChange(false);
    router.push(hit.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (hits.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(hits[active]);
    }
  }

  const optionId = (i: number) => `${listId}-option-${i}`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-[0_8px_24px_rgba(28,25,23,0.08)]"
        >
          <DialogPrimitive.Title className="sr-only">Search customers, quotes and invoices</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-5 shrink-0 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
            <input
              role="combobox"
              aria-expanded={hits.length > 0}
              aria-controls={listId}
              aria-activedescendant={hits.length > 0 ? optionId(active) : undefined}
              aria-autocomplete="list"
              aria-label="Search customers, quotes and invoices"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search customers, quotes or invoices..."
              className="h-14 w-full bg-transparent text-[16px] outline-none placeholder:text-text-muted"
            />
            <kbd className="text-small hidden rounded border border-border px-1.5 text-text-muted sm:block">Esc</kbd>
          </div>

          <div id={listId} role="listbox" aria-label="Results" className="max-h-[56vh] overflow-y-auto p-2">
            {state.status === "idle" ? (
              <p className="text-small px-3 py-6 text-center text-text-muted">Type at least {MIN_QUERY_LENGTH} characters: a name, phone number or document number.</p>
            ) : null}
            {state.status === "loading" && hits.length === 0 ? <p role="status" className="text-small px-3 py-6 text-center text-text-muted">Searching...</p> : null}
            {state.status === "error" ? (
              <p role="alert" className="text-small px-3 py-6 text-center text-destructive">
                {state.message}
              </p>
            ) : null}
            {state.status === "done" && hits.length === 0 ? <p role="status" className="text-small px-3 py-6 text-center text-text-muted">No matches for &ldquo;{normaliseQuery(query)}&rdquo;.</p> : null}

            {GROUPS.map(({ kind, label, icon: Icon }) => {
              const group = hits.filter((h) => h.kind === kind);
              if (group.length === 0) return null;
              return (
                <div key={kind} role="group" aria-label={label} className="mb-1">
                  <p className="text-label px-3 py-2 text-text-muted">{label}</p>
                  {group.map((hit) => {
                    const i = hits.indexOf(hit);
                    return (
                      <div
                        key={`${hit.kind}:${hit.id}`}
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(hit)}
                        className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5", i === active ? "bg-accent-soft" : "hover:bg-surface-muted")}
                      >
                        <Icon className="size-4 shrink-0 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-body-strong truncate">
                            {hit.kind === "customer" ? hit.title : `#${hit.title}`}
                            {hit.archived ? <span className="text-small ml-2 font-normal text-text-muted">Archived</span> : null}
                          </p>
                          {hit.subtitle ? <p className="text-small truncate text-text-muted">{hit.subtitle}</p> : null}
                        </div>
                        {hit.status ? <StatusPill status={hit.status as Status} /> : null}
                        {hit.amountCents !== null ? <span className="tabular text-body shrink-0">{formatMoney(hit.amountCents, currency, locale)}</span> : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
