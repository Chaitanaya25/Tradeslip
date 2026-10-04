import type { Country } from "./region";

/** What `get_public_quote` returns: only fields a customer may see. No ids, no token, no plan name. */
export type PublicQuote = {
  quote: {
    number: number;
    /** Label prefix shown before the number, e.g. "QU-". Often empty. */
    number_prefix: string;
    status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
    title: string | null;
    notes: string | null;
    terms: string | null;
    valid_until: string | null;
    deposit_enabled: boolean;
    deposit_bps: number;
    include_photos: boolean;
    subtotal_cents: number;
    tax_cents: number;
    total_cents: number;
    currency: string;
    tax_rate_bps: number;
    accepted_at: string | null;
    accepted_name: string | null;
    /** True when the customer entered a code emailed to the address on file. */
    accepted_verified: boolean;
    /** True when the customer has an email on file, so accepting needs an emailed code. */
    requires_verification: boolean;
    declined_at: string | null;
    decline_reason: string | null;
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
    trade: string | null;
    tax_number: string | null;
    tax_label: string;
    payment_link_url: string | null;
    /** Show the "Sent with Tradeslip" footer. */
    plan_branding: boolean;
  };
  /** Storage paths, used only on the server to sign URLs. Never rendered or sent to the browser. */
  photos: { path: string; kind: "before" | "after" | "other" }[];
};

/** Minimal runtime check of the JSON the database returned. */
export function isPublicQuote(value: unknown): value is PublicQuote {
  const v = value as Partial<PublicQuote> | null;
  return Boolean(v && typeof v === "object" && v.quote && Array.isArray(v.items) && v.customer && v.business && Array.isArray(v.photos));
}

/** Address as one line: "42 Maple Avenue, Springfield, MA 01103". */
export function formatCustomerAddress(c: PublicQuote["customer"]): string {
  const stateZip = [c.region, c.postcode].filter(Boolean).join(" ");
  return [c.address_line1, c.city, stateZip].filter(Boolean).join(", ");
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}
