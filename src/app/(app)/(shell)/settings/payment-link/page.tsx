import { PaymentLinkForm } from "@/components/settings/payment-link-form";
import { requireBusiness } from "@/lib/auth/session";

export const metadata = { title: "Payment link · Settings · Tradeslip" };

export default async function PaymentLinkSettingsPage() {
  const business = await requireBusiness();
  return <PaymentLinkForm initial={{ payment_link_url: business.payment_link_url ?? "" }} />;
}
