import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { PublicInvoiceView } from "@/components/public/public-invoice-view";
import { isBot } from "@/lib/bots";
import { notifyInvoiceViewed } from "@/server/email/notify";
import { loadPublicInvoice, recordInvoiceFirstView, visitorOwnsInvoice } from "@/server/public-invoice";

type Props = { params: Promise<{ token: string }> };

// Private page: never indexed, and no referrer is sent when the customer follows a link from it.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const data = await loadPublicInvoice(token);
  const base: Metadata = { robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
  if (!data) return { ...base, title: "Not found" };
  return { ...base, title: `Invoice from ${data.business.name}` };
}

export default async function PublicInvoicePage({ params }: Props) {
  const { token } = await params;
  const data = await loadPublicInvoice(token);
  // Unknown token, malformed token and drafts all look identical: a plain 404.
  if (!data) notFound();

  // Count the first view of a sent invoice, but not link previewers and not the owner looking at their own invoice.
  if (data.invoice.status === "sent") {
    const h = await headers();
    const jar = await cookies();
    const hasSession = jar.getAll().some((c) => c.name.startsWith("sb-"));
    const isOwner = await visitorOwnsInvoice(token, hasSession);
    if (!isBot(h.get("user-agent")) && !isOwner && (await recordInvoiceFirstView(token))) {
      // Tell the owner once, after the page has been sent.
      after(() => notifyInvoiceViewed(token));
    }
  }

  return <PublicInvoiceView token={token} data={data} />;
}
