import "server-only";
import { cache } from "react";
import { isPublicInvoiceResult, type PublicInvoiceResult } from "@/lib/public-invoice";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isWellFormedToken } from "@/lib/tokens";

/**
 * Everything the public invoice page and public PDF read goes through here, using the
 * service-role client (server only). Pages never query tables directly; they get the
 * whitelisted JSON from get_public_invoice and nothing else.
 */

/** The customer's view of an invoice, or null for a malformed token, unknown token or a draft. */
export async function getPublicInvoice(token: string): Promise<PublicInvoiceResult | null> {
  if (!isWellFormedToken(token)) return null;
  const { data, error } = await createAdminClient().rpc("get_public_invoice", { p_token: token });
  if (error || !isPublicInvoiceResult(data)) return null;
  return data;
}

/** One lookup per request, shared by generateMetadata and the page. */
export const loadPublicInvoice = cache(getPublicInvoice);

/** Record the first view. Returns true only the first time (so the owner is told once). */
export async function recordInvoiceFirstView(token: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("record_invoice_view", { p_token: token });
  return !error && data === true;
}

/**
 * Is the visitor the signed-in owner of this invoice? A user-client lookup by token only
 * returns a row under RLS when the invoice belongs to the visitor's own business.
 */
export async function visitorOwnsInvoice(token: string, hasSessionCookie: boolean): Promise<boolean> {
  if (!hasSessionCookie) return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("invoices").select("id").eq("public_token", token).maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

/** Business contact + invoice facts for the owner notification email (server only, never rendered publicly). */
export async function getInvoiceOwnerTarget(token: string) {
  const admin = createAdminClient();
  const { data: invoice } = await admin
    .from("invoices")
    .select("id, number, business_id, customer_id")
    .eq("public_token", token)
    .maybeSingle();
  if (!invoice) return null;

  const [{ data: business }, { data: customer }] = await Promise.all([
    admin.from("businesses").select("name, email, invoice_prefix").eq("id", invoice.business_id).maybeSingle(),
    invoice.customer_id ? admin.from("customers").select("name").eq("id", invoice.customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!business) return null;
  return { invoice, business, customerName: customer?.name ?? null };
}
