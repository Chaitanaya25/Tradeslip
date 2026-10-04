"use client";

import { Search } from "lucide-react";
import { useGlobalSearch } from "@/components/search/search-provider";

/** Looks like the reference's search box; opens the global search dialog (also Ctrl/Cmd+K). */
export function SearchTrigger() {
  const { open } = useGlobalSearch();
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search customers, quotes and invoices"
      aria-keyshortcuts="Control+K Meta+K"
      className="text-body flex h-11 w-full items-center gap-3 rounded-lg border border-border-strong bg-surface px-3 text-left text-text-muted transition-colors duration-150 hover:bg-surface-muted md:w-80"
    >
      <Search className="size-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span className="truncate">Search customers, quotes or invoices...</span>
    </button>
  );
}
