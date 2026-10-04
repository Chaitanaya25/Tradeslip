import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { buildInvoiceDocument } from "@/lib/invoice-document";
import { isVoidInvoice } from "@/lib/public-invoice";
import { checkRateLimits, clientIp, ipSubject, tokenSubject } from "@/lib/rate-limit";
import { logoPublicUrl } from "@/lib/supabase/storage";
import { isWellFormedToken } from "@/lib/tokens";
import { invoicePdfResponse } from "@/server/pdf/render";
import { getPublicInvoice } from "@/server/public-invoice";

export const runtime = "nodejs";
export const maxDuration = 30;

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });

/** The customer's PDF of a sent invoice. Drafts, void invoices and unknown tokens are an identical 404. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isWellFormedToken(token)) return notFound();

  const h = await headers();
  const ip = clientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  const { allowed } = await checkRateLimits([
    { subject: ipSubject(ip), key: "public-pdf", limit: 10 },
    { subject: tokenSubject(token), key: "public-pdf", limit: 20 },
  ]);
  if (!allowed) return new NextResponse("Too many requests. Try again in a minute.", { status: 429 });

  const pub = await getPublicInvoice(token);
  if (!pub || isVoidInvoice(pub)) return notFound();

  return invoicePdfResponse(buildInvoiceDocument(pub, { logoUrl: logoPublicUrl(pub.business.logo_path) }), pub.invoice.number);
}
