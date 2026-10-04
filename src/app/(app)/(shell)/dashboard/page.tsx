import { Suspense } from "react";
import Link from "next/link";
import { Mic, Plus } from "lucide-react";
import { CardSkeleton, StatSkeleton } from "@/components/dashboard/card-states";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { SearchTrigger } from "@/components/dashboard/search-trigger";
import { ChartSection, MainRow } from "@/components/dashboard/sections";
import { StatCards } from "@/components/dashboard/stat-cards";
import { TodaysSchedule } from "@/components/dashboard/todays-schedule";
import { Button } from "@/components/ui/button";
import { requireBusiness, requireUser } from "@/lib/auth/session";
import { firstNameOf, formatDashboardDate, greetingFor } from "@/lib/dashboard";
import { displayNameFor } from "@/lib/display-name";
import { REGIONS, quoteWord } from "@/lib/region";

export const metadata = { title: "Dashboard · Tradeslip" };

export default async function DashboardPage() {
  const [user, business] = await Promise.all([requireUser(), requireBusiness()]);
  const now = new Date();
  const region = REGIONS[business.country];
  const first = firstNameOf(displayNameFor({ fullName: user.user_metadata?.full_name, email: user.email }));
  const word = quoteWord(business.country);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display">
            {greetingFor(now, business.timezone)}
            {first && first !== "Account" ? `, ${first}` : ""}
          </h1>
          <p className="text-body text-text-muted">{formatDashboardDate(now, business.timezone, region.locale)}</p>
        </div>
        <div className="flex w-full items-center gap-3 md:w-auto">
          <SearchTrigger />
          <Button asChild className="shrink-0">
            <Link href="/quotes/new">
              <Plus /> New {word}
            </Link>
          </Button>
          <Button asChild variant="icon" className="shrink-0">
            <Link href="/quotes/new?record=1" aria-label="Record a voice quote">
              <Mic />
            </Link>
          </Button>
        </div>
      </header>

      <div className="space-y-4">
        <section aria-label="Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Suspense
            fallback={
              <>
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
              </>
            }
          >
            <StatCards business={business} />
          </Suspense>
        </section>

        <Suspense fallback={<CardSkeleton title="Recent activity" rows={5} />}>
          <MainRow business={business} />
        </Suspense>

        <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Suspense fallback={<CardSkeleton title="Invoices" rows={3} />}>
            <ChartSection business={business} />
          </Suspense>
          <QuickActions quoteWord={word} />
          <Suspense fallback={null}>
            <TodaysSchedule business={business} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
