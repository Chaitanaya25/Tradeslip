import "server-only";
import type { BuilderConfig } from "@/components/quotes/types";
import { builderConfig } from "@/lib/quote-queries";
import type { Business } from "@/lib/supabase/tables";

/** The builder's business settings, with the invoice wording and numbering prefix. */
export function invoiceBuilderConfig(business: Business): BuilderConfig {
  return { ...builderConfig(business), quoteWord: "Invoice", docPrefix: business.invoice_prefix };
}
