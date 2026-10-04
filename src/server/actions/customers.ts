"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrorsFromIssues } from "@/lib/forms";
import { escapeLikePattern, findMatchingCustomer } from "@/lib/quote-helpers";
import { customerInputSchema, type CustomerFormValues } from "@/lib/schemas/customer";
import type { Ctx } from "@/server/customer-resolver";
import { actionBusinessContext } from "./context";

const idSchema = z.uuid();

export type CustomerSaveResult =
  | { ok: true; customerId: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; duplicate?: { id: string; name: string } };

type Simple = { ok: true } | { ok: false; message: string };

function revalidate(id?: string) {
  revalidatePath("/customers");
  if (id) {
    revalidatePath(`/customers/${id}`);
    revalidatePath(`/customers/${id}/edit`);
  }
}

async function logActivity(ctx: Ctx, customerId: string, event: string) {
  // The audit trail is best effort: never fail a save because of it.
  await ctx.supabase.from("activity").insert({ business_id: ctx.business.id, entity_type: "customer", entity_id: customerId, event, meta: {} });
}

/** Another customer with the same name AND the same phone or postcode (the rule quotes use). */
async function findDuplicate(ctx: Ctx, input: { name: string; phone: string | null; postcode: string | null }, ignoreId?: string) {
  const { data } = await ctx.supabase
    .from("customers")
    .select("id, name, phone, postcode")
    .eq("business_id", ctx.business.id)
    .ilike("name", escapeLikePattern(input.name.trim()))
    .limit(25);
  return findMatchingCustomer((data ?? []).filter((c) => c.id !== ignoreId), input);
}

export async function createCustomer(raw: CustomerFormValues): Promise<CustomerSaveResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;

  const parsed = customerInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  const { allow_duplicate, ...columns } = parsed.data;

  if (!allow_duplicate) {
    const dup = await findDuplicate(ctx, columns);
    if (dup) return { ok: false, message: "A customer with this name and phone already exists.", duplicate: { id: dup.id, name: dup.name } };
  }

  const { data, error } = await ctx.supabase.from("customers").insert({ ...columns, business_id: ctx.business.id }).select("id").single();
  if (error || !data) return { ok: false, message: "We couldn't save the customer. Try again." };

  await logActivity(ctx, data.id, "customer.created");
  revalidate(data.id);
  return { ok: true, customerId: data.id };
}

export async function updateCustomer(customerId: string, raw: CustomerFormValues): Promise<CustomerSaveResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(customerId).success) return { ok: false, message: "That customer no longer exists." };

  const parsed = customerInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  const { allow_duplicate, ...columns } = parsed.data;

  if (!allow_duplicate) {
    const dup = await findDuplicate(ctx, columns, customerId);
    if (dup) return { ok: false, message: "A customer with this name and phone already exists.", duplicate: { id: dup.id, name: dup.name } };
  }

  const { data, error } = await ctx.supabase.from("customers").update(columns).eq("id", customerId).eq("business_id", ctx.business.id).select("id");
  if (error) return { ok: false, message: "We couldn't save the customer. Try again." };
  if (!data || data.length === 0) return { ok: false, message: "That customer no longer exists." };

  await logActivity(ctx, customerId, "customer.updated");
  revalidate(customerId);
  return { ok: true, customerId };
}

async function setArchived(customerId: string, archived: boolean): Promise<Simple> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return { ok: false, message: ctx.error.message };
  if (!idSchema.safeParse(customerId).success) return { ok: false, message: "That customer no longer exists." };

  const { data, error } = await ctx.supabase.from("customers").update({ archived }).eq("id", customerId).eq("business_id", ctx.business.id).select("id");
  if (error) return { ok: false, message: "We couldn't update the customer. Try again." };
  if (!data || data.length === 0) return { ok: false, message: "That customer no longer exists." };

  await logActivity(ctx, customerId, archived ? "customer.archived" : "customer.unarchived");
  revalidate(customerId);
  return { ok: true };
}

/** Hide a customer from lists and pickers. Their quotes and invoices keep working. */
export async function archiveCustomer(customerId: string): Promise<Simple> {
  return setArchived(customerId, true);
}

export async function unarchiveCustomer(customerId: string): Promise<Simple> {
  return setArchived(customerId, false);
}

/** Delete a customer who has no quotes or invoices. Otherwise the owner is pointed to Archive. */
export async function deleteCustomer(customerId: string): Promise<Simple> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return { ok: false, message: ctx.error.message };
  if (!idSchema.safeParse(customerId).success) return { ok: false, message: "That customer no longer exists." };

  const { data: customer } = await ctx.supabase.from("customers").select("id").eq("id", customerId).eq("business_id", ctx.business.id).maybeSingle();
  if (!customer) return { ok: false, message: "That customer no longer exists." };

  const [quotes, invoices] = await Promise.all([
    ctx.supabase.from("quotes").select("id", { count: "exact", head: true }).eq("customer_id", customerId).eq("business_id", ctx.business.id),
    ctx.supabase.from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", customerId).eq("business_id", ctx.business.id),
  ]);
  if (quotes.error || invoices.error) return { ok: false, message: "We couldn't check this customer's history. Try again." };
  if ((quotes.count ?? 0) > 0 || (invoices.count ?? 0) > 0) {
    return { ok: false, message: "This customer has quotes or invoices, so it can't be deleted. Archive them instead." };
  }

  const { error } = await ctx.supabase.from("customers").delete().eq("id", customerId).eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: "We couldn't delete the customer. Try again." };

  revalidate(customerId);
  return { ok: true };
}
