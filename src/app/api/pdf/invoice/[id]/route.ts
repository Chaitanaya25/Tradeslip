import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { buildInvoiceDocument } from "@/lib/invoice-document";
import { derivedStatus, remainingCents } from "@/lib/invoice-calc";
import type { PublicInvoice, PublicInvoiceStatus } from "@/lib/public-invoice";
import { todayInTimezone } from "@/lib/quote-calc";
import { logoPublicUrl } from "@/lib/supabase/storage";
import { actionBusinessContext } from "@/server/actions/context";
import { invoicePdfResponse } from "@/server/pdf/render";

import { effectivePlanOf, showsBrandingFooter } from "@/lib/plans";
export const runtime = "nodejs";
export const maxDuration = 30;

/** Preview PDF for the signed-in owner. Own business only; drafts and void invoices are allowed. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const ctx = await actionBusinessContext();
  if (!ctx.ok) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { supabase, business } = ctx;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, customers(name, address_line1, city, region, postcode)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: items } = await supabase
    .from("invoice_items")
    .select("description, qty, unit_rate_cents, amount_cents, position")
    .eq("invoice_id", id)
    .order("position");

  const remaining = remainingCents(invoice.total_cents, invoice.amount_paid_cents);
  const derived = derivedStatus(invoice.status, invoice.due_date, todayInTimezone(business.timezone), remaining, invoice.amount_paid_cents);
  // Drafts and void invoices have no customer-facing status; the preview shows them as plain sent ones.
  const status: PublicInvoiceStatus = derived === "draft" || derived === "void" ? "sent" : derived;

  const pub: PublicInvoice = {
    invoice: {
      number: invoice.number,
      number_prefix: business.invoice_prefix,
      status,
      title: invoice.title,
      notes: invoice.notes,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      subtotal_cents: invoice.subtotal_cents,
      tax_cents: invoice.tax_cents,
      total_cents: invoice.total_cents,
      amount_paid_cents: invoice.amount_paid_cents,
      remaining_cents: remaining,
      days_overdue: 0,
      currency: invoice.currency,
      tax_rate_bps: invoice.tax_rate_bps,
      paid_at: invoice.paid_at,
    },
    items: items ?? [],
    customer: {
      name: invoice.customers?.name ?? null,
      address_line1: invoice.customers?.address_line1 ?? null,
      city: invoice.customers?.city ?? null,
      region: invoice.customers?.region ?? null,
      postcode: invoice.customers?.postcode ?? null,
    },
    business: {
      name: business.name,
      country: business.country,
      timezone: business.timezone,
      logo_path: business.logo_path,
      phone: business.phone,
      email: business.email,
      tax_number: business.tax_number,
      tax_label: business.tax_label,
      payment_link_url: business.payment_link_url,
      plan_branding: showsBrandingFooter(effectivePlanOf(business)),
    },
  };

  return invoicePdfResponse(
    buildInvoiceDocument(pub, { logoUrl: logoPublicUrl(business.logo_path), isDraft: invoice.status === "draft" }),
    invoice.number,
  );
}
