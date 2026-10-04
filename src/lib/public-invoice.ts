import type { Country } from "./region";

/**
 * What `get_public_invoice` returns: only fields a customer may see. No ids, no token, no plan name.
 * A void invoice comes back as the minimal `PublicVoidInvoice` (no amounts, items or customer).
 */
export type PublicInvoiceStatus = "sent" | "viewed" | "partial" | "paid" | "overdue";

export type PublicInvoice = {
  invoice: {
    number: number;
    /** Label prefix shown before the number, e.g. "INV-". */
    number_prefix: string;
    status: PublicInvoiceStatus;
    title: string | null;
    notes: string | null;
    issue_date: string;
    due_date: string;
    subtotal_cents: number;
    tax_cents: number;
    total_cents: number;
    amount_paid_cents: number;
    remaining_cents: number;
    days_overdue: number;
    currency: string;
    tax_rate_bps: number;
    paid_at: string | null;
  };
  items: { description: string; qty: number; unit_rate_cents: number; amount_cents: number; position: number }[];
  customer: {
    name: string | null;
    address_line1: string | null;
    city: string | null;
    region: string | null;
    postcode: string | null;
  };
  business: {
    name: string;
    country: Country;
    timezone: string;
    logo_path: string | null;
    phone: string | null;
    email: string | null;
    tax_number: string | null;
    tax_label: string;
    payment_link_url: string | null;
    /** Show the "Sent with Tradeslip" footer. */
    plan_branding: boolean;
  };
};

export type PublicVoidInvoice = {
  invoice: { number: number; number_prefix: string; status: "void" };
  business: {
    name: string;
    country: Country;
    timezone: string;
    logo_path: string | null;
    phone: string | null;
    email: string | null;
    plan_branding: boolean;
  };
};

export type PublicInvoiceResult = PublicInvoice | PublicVoidInvoice;

export function isVoidInvoice(value: PublicInvoiceResult): value is PublicVoidInvoice {
  return value.invoice.status === "void";
}

/** Minimal runtime check of the JSON the database returned. */
export function isPublicInvoiceResult(value: unknown): value is PublicInvoiceResult {
  const v = value as Partial<PublicInvoice> | null;
  if (!v || typeof v !== "object" || !v.invoice || !v.business) return false;
  if (v.invoice.status === ("void" as string)) return true;
  return Array.isArray(v.items) && Boolean(v.customer);
}
