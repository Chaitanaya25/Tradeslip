import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { PublicQuoteView } from "@/components/public/public-quote-view";
import { isBot } from "@/lib/bots";
import { quoteWord } from "@/lib/region";
import { notifyOwner } from "@/server/email/notify";
import { loadPublicQuote, recordFirstView, signPublicPhotos, visitorOwnsQuote } from "@/server/public";

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

  // Count the first view of a sent quote, but not link previewers and not the owner looking at their own quote.
  if (data.quote.status === "sent") {
    const h = await headers();
    const jar = await cookies();
    const hasSession = jar.getAll().some((c) => c.name.startsWith("sb-"));
    if (!isBot(h.get("user-agent")) && !(await visitorOwnsQuote(token, hasSession))) {
      if (await recordFirstView(token)) {
        // Tell the owner once, after the page has been sent.
        after(() => notifyOwner(token, { kind: "viewed" }));
      }
    }
  }

  const photos = data.quote.include_photos ? await signPublicPhotos(data.photos) : [];
  return <PublicQuoteView token={token} data={data} photos={photos} />;
}
