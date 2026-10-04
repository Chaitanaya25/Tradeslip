import { redirect } from "next/navigation";
import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { getBusiness, requireUser } from "@/lib/auth/session";

export const metadata = { title: "Dashboard · Tradeslip" };

export default async function DashboardPage() {
  const user = await requireUser();
  const business = await getBusiness();
  if (!business?.onboarded_at) redirect("/onboarding");

  return (
    <PlaceholderPage title="Dashboard" email={user.email}>
      <p className="text-body">
        Business: <span className="text-body-strong">{business.name}</span>
      </p>
      <p className="text-small text-text-muted">
        Placeholder page. The real dashboard is built in a later phase.
      </p>
    </PlaceholderPage>
  );
}
