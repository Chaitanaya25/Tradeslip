import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { InvoiceBuilder } from "@/components/invoices/invoice-builder";
import { requireBusiness } from "@/lib/auth/session";
import { invoiceBuilderConfig } from "@/lib/invoice-queries";
import { formatCentsForInput } from "@/lib/money-input";
import { loadBuilderOptions } from "@/lib/quote-queries";
import { quoteWord } from "@/lib/region";
import { emptyCustomer, emptyItem } from "@/lib/schemas/quote";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit invoice · Tradeslip" };

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const business = await requireBusiness();
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, customers(id, name, email, phone, address_line1, city, region, postcode), quotes(number)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!invoice) notFound();
  // Only drafts are editable; everything else is read-only on the detail page.
  if (invoice.status !== "draft") redirect(`/invoices/${id}`);

  const [{ data: items }, options] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("position"),
    loadBuilderOptions(business.id),
  ]);

  const c = invoice.customers;
  return (
    <InvoiceBuilder
      invoiceId={invoice.id}
      number={invoice.number}
      config={invoiceBuilderConfig(business)}
      paymentTermsDays={business.payment_terms_days}
      customers={options.customers}
      priceItems={options.priceItems}
      fromEstimate={invoice.quotes ? `${quoteWord(business.country)} #${business.quote_prefix}${invoice.quotes.number}` : null}
      initialValues={{
        customer: c
          ? {
              customer_id: c.id,
              name: c.name,
              email: c.email ?? "",
              phone: c.phone ?? "",
              address_line1: c.address_line1 ?? "",
              city: c.city ?? "",
              region: c.region ?? "",
              postcode: c.postcode ?? "",
            }
          : emptyCustomer(),
        title: invoice.title ?? "",
        notes: invoice.notes ?? "",
        issue_date: invoice.issue_date,
        due_date: invoice.due_date,
        items:
          (items ?? []).length > 0
            ? (items ?? []).map((i) => ({
                description: i.description,
                type: i.type,
                qty: String(Number(i.qty)),
                rate: i.unit_rate_cents === 0 && i.needs_price ? "" : formatCentsForInput(i.unit_rate_cents),
                price_item_id: i.price_item_id ?? "",
                needs_price: i.needs_price,
              }))
            : [emptyItem()],
      }}
    />
  );
}
