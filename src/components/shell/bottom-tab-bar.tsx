"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Ellipsis, FileText, Home, LogOut, Mic, Receipt, Settings, Users, type LucideIcon } from "lucide-react";
import { isActiveNav } from "@/components/shell/nav-items";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { signOut } from "@/server/actions/auth";

const MORE_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/price-book", label: "Price Book", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] leading-4 font-medium transition-colors duration-150",
        active ? "text-accent" : "text-text-muted",
      )}
    >
      <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
      {label}
    </Link>
  );
}

/** Mobile (<768px): Dashboard, Quotes, mic FAB, Invoices, More. */
export function BottomTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_LINKS.some((l) => isActiveNav(pathname, l.href));

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <Tab href="/dashboard" label="Dashboard" icon={Home} active={isActiveNav(pathname, "/dashboard")} />
        <Tab href="/quotes" label="Quotes" icon={FileText} active={isActiveNav(pathname, "/quotes") && pathname !== "/quotes/new"} />
        <div className="flex justify-center">
          <Link
            href="/quotes/new"
            aria-label="New quote by voice"
            className="-mt-7 flex size-14 items-center justify-center rounded-full bg-accent text-white ring-4 ring-bg transition-colors duration-150 hover:bg-accent-hover"
          >
            <Mic className="size-6" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
        <Tab href="/invoices" label="Invoices" icon={Receipt} active={isActiveNav(pathname, "/invoices")} />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] leading-4 font-medium transition-colors duration-150",
            moreActive ? "text-accent" : "text-text-muted",
          )}
        >
          <Ellipsis className="size-5" strokeWidth={1.5} aria-hidden="true" />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-lg px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="px-0">
            <SheetTitle className="text-h2">More</SheetTitle>
          </SheetHeader>
          <ul className="space-y-1">
            {MORE_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={isActiveNav(pathname, href) ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-lg px-3 text-[15px]",
                    isActiveNav(pathname, href) ? "bg-accent-soft font-medium text-accent" : "hover:bg-surface-muted",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <form action={signOut}>
                <button type="submit" className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-[15px] hover:bg-surface-muted">
                  <LogOut className="size-5" strokeWidth={1.5} aria-hidden="true" />
                  Sign out
                </button>
              </form>
            </li>
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
