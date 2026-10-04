import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { PublicQuote } from "@/lib/public-quote";
import { buildQuoteDocument } from "@/lib/quote-document";
import { logoPublicUrl } from "@/lib/supabase/storage";
import { actionBusinessContext } from "@/server/actions/context";
import { quotePdfResponse } from "@/server/pdf/render";

import { effectivePlanOf, showsBrandingFooter } from "@/lib/plans";
export const runtime = "nodejs";
export const maxDuration = 30;

/** Preview PDF for the signed-in owner. Own business only; drafts are allowed. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const ctx = await actionBusinessContext();
  if (!ctx.ok) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { supabase, business } = ctx;

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, customers(name, address_line1, city, region, postcode)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!quote) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [{ data: items }, { data: photoRows }] = await Promise.all([
    supabase.from("quote_items").select("description, qty, unit_rate_cents, amount_cents, position").eq("quote_id", id).order("position"),
    quote.include_photos
      ? supabase.from("job_photos").select("storage_path, kind").eq("quote_id", id).eq("business_id", business.id).order("position")
      : Promise.resolve({ data: [] as { storage_path: string; kind: "before" | "after" | "other" }[] }),
  ]);

  const photoPaths = (photoRows ?? []).map((p) => p.storage_path);
  const { data: signed } = photoPaths.length
    ? await supabase.storage.from("job-photos").createSignedUrls(photoPaths, 600)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const photos = (photoRows ?? []).flatMap((p) => {
    const url = urlByPath.get(p.storage_path);
    return url ? [{ url, kind: p.kind }] : [];
  });

  const pub: PublicQuote = {
    quote: {
      number: quote.number,
      number_prefix: business.quote_prefix,
      status: quote.status,
      title: quote.title,
      notes: quote.notes,
      terms: quote.terms,
      valid_until: quote.valid_until,
      deposit_enabled: quote.deposit_enabled,
      deposit_bps: quote.deposit_bps,
      include_photos: quote.include_photos,
      subtotal_cents: quote.subtotal_cents,
      tax_cents: quote.tax_cents,
      total_cents: quote.total_cents,
      currency: quote.currency,
      tax_rate_bps: quote.tax_rate_bps,
      accepted_at: quote.accepted_at,
      accepted_name: quote.accepted_name,
      accepted_verified: quote.accepted_verified,
      requires_verification: false,
      declined_at: quote.declined_at,
      decline_reason: quote.decline_reason,
    },
    items: items ?? [],
    customer: {
      name: quote.customers?.name ?? null,
      address_line1: quote.customers?.address_line1 ?? null,
      city: quote.customers?.city ?? null,
      region: quote.customers?.region ?? null,
      postcode: quote.customers?.postcode ?? null,
    },
    business: {
      name: business.name,
      country: business.country,
      timezone: business.timezone,
      logo_path: business.logo_path,
      phone: business.phone,
      email: business.email,
      trade: business.trade,
      tax_number: business.tax_number,
      tax_label: business.tax_label,
      payment_link_url: business.payment_link_url,
      plan_branding: showsBrandingFooter(effectivePlanOf(business)),
    },
    photos: [],
  };

  return quotePdfResponse(buildQuoteDocument(pub, { logoUrl: logoPublicUrl(business.logo_path), photos }), quote.number);
}
