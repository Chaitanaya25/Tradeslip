"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/shell/logo";
import { NAV_ITEMS, isActiveNav } from "@/components/shell/nav-items";
import { UserMenu, type ShellUser } from "@/components/shell/user-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Desktop (>=1024px): 240px sidebar. Tablet (768-1023px): 72px icon rail with
 * tooltips. Hidden on mobile, where the bottom tab bar takes over.
 */
export function Sidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-border bg-bg md:flex lg:w-[240px]">
      <div className="flex h-[72px] items-center justify-center px-3 lg:justify-start lg:px-6">
        <Link href="/dashboard" aria-label="Tradeslip dashboard" className="rounded-md">
          <Logo wordmarkClassName="hidden lg:inline" />
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 px-3 pt-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActiveNav(pathname, href);
          return (
            <Tooltip key={href}>
              <TooltipTrigger asChild>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center justify-center gap-3 rounded-lg text-[15px] transition-colors duration-150 lg:justify-start lg:px-3",
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-text/80 hover:bg-surface-muted",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span className="sr-only lg:not-sr-only">{label}</span>
                </Link>
              </TooltipTrigger>
              {/* Labels are visible at lg, so the tooltip only matters on the rail. */}
              <TooltipContent side="right" sideOffset={10} className="lg:hidden">
                {label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
