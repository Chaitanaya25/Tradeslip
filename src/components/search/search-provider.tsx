"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SearchDialog } from "@/components/search/search-dialog";

type SearchContextValue = { open: () => void };

const SearchContext = createContext<SearchContextValue>({ open: () => undefined });

/** Opens the global search from anywhere in the shell, with Ctrl/Cmd+K. */
export function useGlobalSearch(): SearchContextValue {
  return useContext(SearchContext);
}

export function SearchProvider({ children, currency, locale }: { children: ReactNode; currency: string; locale: string }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open: show }), [show]);
  return (
    <SearchContext.Provider value={value}>
      {children}
      <SearchDialog open={open} onOpenChange={setOpen} currency={currency} locale={locale} />
    </SearchContext.Provider>
  );
}
