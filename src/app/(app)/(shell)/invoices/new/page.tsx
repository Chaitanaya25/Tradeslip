import { z } from "zod";
import { AutoCreateFromQuote } from "@/components/invoices/create-invoice-button";
import { InvoiceBuilder } from "@/components/invoices/invoice-builder";
import { requireBusiness } from "@/lib/auth/session";
import { defaultDueDate } from "@/lib/invoice-calc";
import { invoiceBuilderConfig } from "@/lib/invoice-queries";
import { todayInTimezone } from "@/lib/quote-calc";
import { loadBuilderOptions, loadPrefillCustomer } from "@/lib/quote-queries";
import { quoteWord } from "@/lib/region";
import { emptyItem } from "@/lib/schemas/quote";

export const metadata = { title: "New invoice · Tradeslip" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ quoteId?: string; customerId?: string }> }) {
  const { quoteId, customerId } = await searchParams;
  const business = await requireBusiness();

  // From an accepted quote: the same action as the "Create invoice" button, then on to the draft.
  if (quoteId && z.uuid().safeParse(quoteId).success) {
    return <AutoCreateFromQuote quoteId={quoteId} word={quoteWord(business.country)} />;
  }

  const [{ customers, priceItems }, customer] = await Promise.all([loadBuilderOptions(business.id), loadPrefillCustomer(business.id, customerId)]);
  const today = todayInTimezone(business.timezone);

  return (
    <InvoiceBuilder
      invoiceId={null}
      number={null}
      config={invoiceBuilderConfig(business)}
      paymentTermsDays={business.payment_terms_days}
      customers={customers}
      priceItems={priceItems}
      fromEstimate={null}
      initialValues={{
        customer,
        title: "",
        notes: "",
        issue_date: today,
        due_date: defaultDueDate(today, business.payment_terms_days),
        items: [emptyItem()],
      }}
    />
  );
}
