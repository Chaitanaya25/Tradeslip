import { notFound } from "next/navigation";
import { z } from "zod";
import { CustomerForm } from "@/components/customers/customer-form";
import { requireBusiness } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit customer · Tradeslip" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const business = await requireBusiness();
  const supabase = await createClient();
  const { data: c } = await supabase.from("customers").select("*").eq("id", id).eq("business_id", business.id).maybeSingle();
  if (!c) notFound();

  return (
    <CustomerForm
      customerId={c.id}
      country={business.country}
      initialValues={{
        name: c.name,
        email: c.email ?? "",
        phone: c.phone ?? "",
        address_line1: c.address_line1 ?? "",
        city: c.city ?? "",
        region: c.region ?? "",
        postcode: c.postcode ?? "",
        notes: c.notes ?? "",
      }}
    />
  );
}
