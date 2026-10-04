import type { Metadata } from "next";
import { UnsubscribeForm } from "@/components/public/unsubscribe-form";
import { resolveUnsubscribeSecret, verifyUnsubscribeToken } from "@/lib/reminder-token";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = { params: Promise<{ token: string }> };

// Private page: never indexed, no referrer sent onward.
export const metadata: Metadata = {
  title: "Stop reminders",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const shell = "mx-auto flex min-h-screen w-full max-w-[480px] flex-col justify-center px-5 py-10";

/** Confirm page for the unsubscribe link in reminder emails. Invalid or tampered links get one neutral message. */
export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params;
  const secret = resolveUnsubscribeSecret();
  const claim = secret ? verifyUnsubscribeToken(token, secret) : null;

  let businessName: string | null = null;
  if (claim) {
    const { data } = await createAdminClient().from("businesses").select("name").eq("id", claim.businessId).maybeSingle();
    businessName = data?.name ?? null;
  }

  if (!claim || !businessName) {
    return (
      <main className={shell}>
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em]">This link isn&apos;t working</h1>
        <p className="mt-2 text-[17px] leading-6 text-text-muted">If you keep getting reminders, reply to one of the emails and ask the business to stop them.</p>
      </main>
    );
  }

  return (
    <main className={shell}>
      <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em]">Stop reminders from {businessName}?</h1>
      <p className="mt-2 mb-6 text-[17px] leading-6 text-text-muted">
        You&apos;ll stop getting automatic follow-up and payment reminders from {businessName}. Quotes and invoices they send you directly are not affected.
      </p>
      <UnsubscribeForm token={token} businessName={businessName} />
    </main>
  );
}
