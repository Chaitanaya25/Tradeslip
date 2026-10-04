"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Warns before leaving a page with unsaved edits:
 *  - closing/refreshing the tab: the browser's own prompt (beforeunload)
 *  - clicking any in-app link (sidebar, back arrow, tab bar): our own dialog
 * The browser's Back button cannot be intercepted by the App Router.
 */
export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }

    function onClick(e: MouseEvent) {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  function leave() {
    const href = pendingHref;
    setPendingHref(null);
    dirtyRef.current = false;
    if (href) router.push(href);
  }

  const dialog = (
    <ConfirmDialog
      open={pendingHref !== null}
      onOpenChange={(open) => {
        if (!open) setPendingHref(null);
      }}
      title="Leave without saving?"
      description="Your changes to this quote haven't been saved."
      cancelLabel="Keep editing"
      confirmLabel="Leave without saving"
      onConfirm={leave}
    />
  );

  return { dialog };
}
