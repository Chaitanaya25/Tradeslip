import { CustomersList, type CustomerListRow } from "@/components/customers/customers-list";
import { requireBusiness } from "@/lib/auth/session";
import { REGIONS } from "@/lib/region";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Customers · Tradeslip" };

export default async function CustomersPage() {
  const business = await requireBusiness();
  const supabase = await createClient();

  const [customers, summary] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone, address_line1, city, region, postcode, archived")
      .eq("business_id", business.id)
      .order("name")
      .limit(2000),
    supabase.rpc("customer_summary", { p_business_id: business.id }),
  ]);

  const stats = new Map((summary.data ?? []).map((s) => [s.customer_id, s]));
  const rows: CustomerListRow[] = (customers.data ?? []).map((c) => {
    const s = stats.get(c.id);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: [c.address_line1, c.city].filter(Boolean).join(", "),
      archived: c.archived,
      quoteCount: s?.quote_count ?? 0,
      invoiceCount: s?.invoice_count ?? 0,
      outstandingCents: Number(s?.outstanding_cents ?? 0),
      totalPaidCents: Number(s?.total_paid_cents ?? 0),
      lastActivityAt: s?.last_activity_at ?? null,
    };
  });

  return <CustomersList rows={rows} currency={business.currency} locale={REGIONS[business.country].locale} timezone={business.timezone} />;
}
