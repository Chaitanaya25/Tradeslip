"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActiveNav } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/settings/business", label: "Business profile" },
  { href: "/settings/regional", label: "Regional and tax" },
  { href: "/settings/numbering", label: "Numbering and defaults" },
  { href: "/settings/payment-link", label: "Payment link" },
  { href: "/settings/reminders", label: "Reminders" },
  { href: "/settings/billing", label: "Billing" },
] as const;

const COMING_SOON = ["Data export"] as const;

/** Left sub-nav on desktop, horizontally scrolling tabs on small screens. */
export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {SECTIONS.map(({ href, label }) => {
          const active = isActiveNav(pathname, href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center rounded-lg px-3 text-[15px] whitespace-nowrap transition-colors duration-150",
                  active ? "bg-accent-soft font-medium text-accent" : "text-text/80 hover:bg-surface-muted",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
        {COMING_SOON.map((label) => (
          <li key={label} className="shrink-0">
            <span
              aria-disabled="true"
              className="flex h-11 cursor-not-allowed items-center gap-2 rounded-lg px-3 text-[15px] whitespace-nowrap text-text-subtle"
            >
              {label}
              <span className="text-small rounded-sm bg-surface-muted px-1.5 text-text-muted">Coming soon</span>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
