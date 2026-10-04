import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getBusiness, requireUser } from "@/lib/auth/session";
import { displayNameFor, initialsFor } from "@/lib/display-name";
import { REGIONS } from "@/lib/region";

// Everything inside the shell needs a finished business. /onboarding sits
// outside this group, so it never renders the sidebar.
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const business = await getBusiness();
  if (!business?.onboarded_at) redirect("/onboarding");

  const name = displayNameFor({ fullName: user.user_metadata?.full_name, email: user.email });

  return (
    <AppShell
      user={{ name, initials: initialsFor(name), businessName: business.name }}
      money={{ currency: business.currency, locale: REGIONS[business.country].locale }}
    >
      {children}
    </AppShell>
  );
}
