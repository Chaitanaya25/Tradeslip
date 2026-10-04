import { CustomerForm } from "@/components/customers/customer-form";
import { requireBusiness } from "@/lib/auth/session";
import { emptyCustomerForm } from "@/lib/schemas/customer";

export const metadata = { title: "Add customer · Tradeslip" };

export default async function NewCustomerPage() {
  const business = await requireBusiness();
  return <CustomerForm customerId={null} initialValues={emptyCustomerForm()} country={business.country} />;
}
