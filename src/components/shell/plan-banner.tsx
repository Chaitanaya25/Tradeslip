"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { PlanBannerContent } from "@/lib/plan-banner";

export type PlanBannerData = PlanBannerContent;

const keyFor = (id: string) => `tradeslip:plan-banner:${id}`;

/** Calm one-line notice about the trial or the free plan. Dismissing it lasts for this browser session. */
export function PlanBanner({ id, text, href, cta }: PlanBannerData) {
  // Starts hidden until we know it was not dismissed, so a dismissed banner never flashes.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(keyFor(id)) === "1";
    } catch {
      /* storage can be blocked: just show it */
    }
    const t = setTimeout(() => setVisible(!dismissed), 0);
    return () => clearTimeout(t);
  }, [id]);

  if (!visible) return null;

  return (
    <div role="status" className="border-b border-border bg-accent-soft md:ml-0">
      <div className="mx-auto flex w-full max-w-[1320px] items-center gap-3 px-4 py-2 md:px-8">
        <p className="text-small flex-1 text-text">
          {text}{" "}
          <Link href={href} className="font-medium text-accent underline-offset-2 hover:underline">
            {cta}
          </Link>
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setVisible(false);
            try {
              window.sessionStorage.setItem(keyFor(id), "1");
            } catch {
              /* ignore */
            }
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface"
        >
          <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
