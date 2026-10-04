import "server-only";
import { failure } from "@/lib/action-result";
import type { checkCustomer } from "@/lib/schemas/document-parts";
import { escapeLikePattern, findMatchingCustomer } from "@/lib/quote-helpers";
import type { actionBusinessContext } from "@/server/actions/context";

/** Pieces shared by the quote and invoice actions. Not a "use server" file: nothing here is callable from the browser. */

export type Ctx = Extract<Awaited<ReturnType<typeof actionBusinessContext>>, { ok: true }>;
export type CheckedCustomer = ReturnType<typeof checkCustomer>;

/** Allocate the next quote or invoice number (atomic in the database). */
export async function allocateNumber(ctx: Ctx, kind: "quote" | "invoice"): Promise<number | null> {
  const { data, error } = await ctx.supabase.rpc("next_doc_number", {
    p_business_id: ctx.business.id,
    p_kind: kind,
  });
  return error || typeof data !== "number" ? null : data;
}

/**
 * The customer for a document: the explicitly chosen one (updated with the form's
 * contact details), else an existing match (same name + phone or postcode), else new.
 */
export async function resolveCustomer(
  ctx: Ctx,
  customer: CheckedCustomer,
): Promise<{ id: string } | { error: ReturnType<typeof failure> }> {
  const columns = {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address_line1: customer.address_line1,
    city: customer.city,
    region: customer.region,
    postcode: customer.postcode,
  };

  if (customer.customer_id) {
    const { data, error } = await ctx.supabase
      .from("customers")
      .update(columns)
      .eq("id", customer.customer_id)
      .eq("business_id", ctx.business.id)
      .select("id");
    if (error) return { error: failure("We couldn't save the customer. Try again.") };
    if (!data || data.length === 0) {
      return { error: failure("That customer no longer exists.", { "customer.name": "Choose the customer again." }) };
    }
    return { id: customer.customer_id };
  }

  const { data: candidates } = await ctx.supabase
    .from("customers")
    .select("id, name, phone, postcode")
    .eq("business_id", ctx.business.id)
    .ilike("name", escapeLikePattern(customer.name.trim()))
    .limit(25);
  const match = findMatchingCustomer(candidates ?? [], customer);
  if (match) return { id: match.id };

  const { data: created, error } = await ctx.supabase
    .from("customers")
    .insert({ ...columns, business_id: ctx.business.id })
    .select("id")
    .single();
  if (error || !created) return { error: failure("We couldn't save the customer. Try again.") };
  return { id: created.id };
}
