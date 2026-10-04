import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { buildQuoteDocument } from "@/lib/quote-document";
import { checkRateLimits, clientIp, ipSubject, tokenSubject } from "@/lib/rate-limit";
import { logoPublicUrl } from "@/lib/supabase/storage";
import { isWellFormedToken } from "@/lib/tokens";
import { quotePdfResponse } from "@/server/pdf/render";
import { getPublicQuote, signPublicPhotos } from "@/server/public";

export const runtime = "nodejs";
export const maxDuration = 30;

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });

/** The customer's PDF of a sent quote. Drafts and unknown tokens are an identical 404. */
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

  const pub = await getPublicQuote(token);
  if (!pub) return notFound();

  const photos = pub.quote.include_photos ? await signPublicPhotos(pub.photos) : [];
  return quotePdfResponse(
    buildQuoteDocument({ ...pub, photos: [] }, { logoUrl: logoPublicUrl(pub.business.logo_path), photos }),
    pub.quote.number,
  );
}
