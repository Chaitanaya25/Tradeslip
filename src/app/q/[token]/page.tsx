import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { PublicQuoteView } from "@/components/public/public-quote-view";
import { isBot } from "@/lib/bots";
import { maskEmail } from "@/lib/otp";
import { quoteWord } from "@/lib/region";
import { notifyOwner } from "@/server/email/notify";
import { getAcceptTarget, loadPublicQuote, recordFirstView, signPublicPhotos, visitorOwnsQuote } from "@/server/public";

type Props = { params: Promise<{ token: string }> };

// Private page: never indexed, and no referrer is sent when the customer follows a link from it.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const data = await loadPublicQuote(token);
  const base: Metadata = { robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
  if (!data) return { ...base, title: "Not found" };
  return { ...base, title: `${quoteWord(data.business.country)} from ${data.business.name}` };
}

export default async function PublicQuotePage({ params }: Props) {
  const { token } = await params;
  const data = await loadPublicQuote(token);
  // Unknown token, malformed token and drafts all look identical: a plain 404.
  if (!data) notFound();

  const h = await headers();
  const jar = await cookies();
  const hasSession = jar.getAll().some((c) => c.name.startsWith("sb-"));
  // A user-client lookup by token only returns a row for the signed-in owner of this quote.
  const isOwner = await visitorOwnsQuote(token, hasSession);

  // Count the first view of a sent quote, but not link previewers and not the owner looking at their own quote.
  if (data.quote.status === "sent" && !isBot(h.get("user-agent")) && !isOwner) {
    if (await recordFirstView(token)) {
      // Tell the owner once, after the page has been sent.
      after(() => notifyOwner(token, { kind: "viewed" }));
    }
  }

  // The customer only ever sees a masked address (j***@gmail.com), never the real one.
  let maskedEmail: string | null = null;
  if (data.quote.requires_verification && (data.quote.status === "sent" || data.quote.status === "viewed")) {
    const target = await getAcceptTarget(token);
    maskedEmail = target?.email ? maskEmail(target.email) : null;
  }

  const photos = data.quote.include_photos ? await signPublicPhotos(data.photos) : [];
  return <PublicQuoteView token={token} data={data} photos={photos} maskedEmail={maskedEmail} isOwner={isOwner} />;
}
