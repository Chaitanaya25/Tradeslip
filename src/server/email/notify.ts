import "server-only";
import { formatMoney } from "@/lib/money";
import { depositCents } from "@/lib/quote-calc";
import { REGIONS, quoteWord } from "@/lib/region";
import { getOwnerNotificationTarget } from "@/server/public";
import { sendEmail } from "./send";
import { OwnerNotificationEmail, ownerNotificationSubject, type OwnerNotificationProps } from "./templates/owner-notification";

type Event = { kind: "viewed" } | { kind: "accepted"; acceptedName: string; verified: boolean } | { kind: "declined"; reason: string | null };

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Tell the business owner what the customer just did. Never throws and never blocks
 * the customer's request on a failure: a missing key, address or Resend error is just skipped.
 */
export async function notifyOwner(token: string, event: Event): Promise<void> {
  try {
    const target = await getOwnerNotificationTarget(token);
    const to = target?.business.email;
    if (!target || !to) return;

    const { quote, business, customerName } = target;
    const locale = REGIONS[business.country].locale;
    const common = {
      quoteWord: quoteWord(business.country),
      number: `${business.quote_prefix}${quote.number}`,
      customerName,
      link: `${appUrl()}/quotes/${quote.id}`,
      businessName: business.name,
    };

    let props: OwnerNotificationProps;
    if (event.kind === "viewed") props = { kind: "viewed", ...common };
    else if (event.kind === "declined") props = { kind: "declined", ...common, reason: event.reason };
    else {
      props = {
        kind: "accepted",
        ...common,
        acceptedName: event.acceptedName,
        verified: event.verified,
        totalText: formatMoney(quote.total_cents, quote.currency, locale),
        depositText: quote.deposit_enabled
          ? formatMoney(depositCents(quote.total_cents, quote.deposit_bps), quote.currency, locale)
          : null,
      };
    }

    await sendEmail({
      businessName: business.name,
      to,
      subject: ownerNotificationSubject(props),
      react: OwnerNotificationEmail(props),
    });
  } catch {
    console.warn("[email] owner notification skipped");
  }
}
