import { redirect } from "next/navigation";
import { PlaceholderPage } from "@/components/shell/placeholder-page";
import { getBusiness, requireUser } from "@/lib/auth/session";

export const metadata = { title: "Onboarding · Tradeslip" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const business = await getBusiness();
  if (business?.onboarded_at) redirect("/dashboard");

  return (
    <PlaceholderPage title="Onboarding" email={user.email}>
      <p className="text-body text-text-muted">
        The setup wizard is not built yet. Until it is, load the demo business by running this in the
        Supabase SQL editor, then reload this page:
      </p>
      <pre className="overflow-x-auto rounded-lg bg-surface-muted p-4 text-small text-text">
        {`select public.seed_demo_data('${user.id}');`}
      </pre>
    </PlaceholderPage>
  );
}
