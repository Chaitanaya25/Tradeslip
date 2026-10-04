import { NumberingForm } from "@/components/settings/numbering-form";
import { requireBusiness } from "@/lib/auth/session";
import { formatCentsForInput } from "@/lib/money-input";
import { quoteWord } from "@/lib/region";

export const metadata = { title: "Numbering and defaults · Settings · Tradeslip" };

export default async function NumberingSettingsPage() {
  const business = await requireBusiness();

  return (
    <NumberingForm
      currency={business.currency}
      quoteWord={quoteWord(business.country)}
      nextQuoteNumber={business.next_quote_number}
      nextInvoiceNumber={business.next_invoice_number}
      initial={{
        quote_prefix: business.quote_prefix,
        invoice_prefix: business.invoice_prefix,
        hourly_rate: formatCentsForInput(business.default_hourly_rate_cents),
        callout_fee: business.callout_fee_cents > 0 ? formatCentsForInput(business.callout_fee_cents) : "",
        payment_terms_days: String(business.payment_terms_days),
        quote_validity_days: String(business.quote_validity_days),
      }}
    />
  );
}
