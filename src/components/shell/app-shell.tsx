import type { ReactNode } from "react";
import { SearchProvider } from "@/components/search/search-provider";
import { BottomTabBar } from "@/components/shell/bottom-tab-bar";
import { Sidebar } from "@/components/shell/sidebar";
import type { ShellUser } from "@/components/shell/user-menu";
import { TooltipProvider } from "@/components/ui/tooltip";

/** Signed-in frame: sidebar / icon rail / bottom tab bar around the page content. */
export function AppShell({ user, money, children }: { user: ShellUser; money: { currency: string; locale: string }; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <SearchProvider currency={money.currency} locale={money.locale}>
        <Sidebar user={user} />
        <div className="md:pl-[72px] lg:pl-[240px]">
          <main className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-28 md:px-8 md:py-8">{children}</main>
        </div>
        <BottomTabBar />
      </SearchProvider>
    </TooltipProvider>
  );
}
