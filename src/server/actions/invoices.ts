"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import { fieldErrorsFromIssues } from "@/lib/forms";
import { invoiceErrorMessage } from "@/lib/invoice-errors";
import { buildInvoiceDuplicatePayload, buildInvoicePayload } from "@/lib/invoice-helpers";
import { todayInTimezone } from "@/lib/quote-calc";
import type { DocItem } from "@/lib/quote-helpers";
import { invoiceInputSchema, type InvoiceFormValues } from "@/lib/schemas/invoice";
import type { Business } from "@/lib/supabase/tables";
import { allocateNumber, resolveCustomer, type Ctx } from "@/server/customer-resolver";
import { actionBusinessContext } from "./context";

const idSchema = z.uuid();
const NOT_EDITABLE = "This invoice has already been sent, so it can't be edited. Duplicate it to make changes.";

function revalidateInvoice(id?: string) {
  revalidatePath("/invoices");
  if (id) {
    revalidatePath(`/invoices/${id}`);
    revalidatePath(`/invoices/${id}/edit`);
  }
}

function businessSnapshot(business: Business) {
  return { taxEnabled: business.tax_enabled, taxRateBps: business.tax_rate_bps, currency: business.currency };
}

async function logActivity(ctx: Ctx, invoiceId: string, event: string, meta: Record<string, string | number>) {
  // The audit trail is best effort: never fail a save because of it.
  await ctx.supabase.from("activity").insert({
    business_id: ctx.business.id,
    entity_type: "invoice",
    entity_id: invoiceId,
    event,
    meta,
  });
}

/** Create an invoice from an accepted quote. One live invoice per quote: a second tap returns the existing one. */
export async function createInvoiceFromQuote(quoteId: string): Promise<ActionResult<{ invoiceId: string; alreadyExisted: boolean }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(quoteId).success) return failure("That quote no longer exists.");

  // Belt and braces on top of RLS and the function's own checks.
  const { data: quote } = await ctx.supabase.from("quotes").select("id").eq("id", quoteId).eq("business_id", ctx.business.id).maybeSingle();
  if (!quote) return failure("That quote no longer exists.");

  const { data, error } = await ctx.supabase.rpc("create_invoice_from_quote", { p_quote_id: quoteId });
  if (error) return failure(invoiceErrorMessage(error, "We couldn't create the invoice. Try again.", "That quote no longer exists."));

  const result = data as { invoice_id?: string; already_existed?: boolean } | null;
  if (!result?.invoice_id) return failure("We couldn't create the invoice. Try again.");

  revalidateInvoice(result.invoice_id);
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  return { ok: true, invoiceId: result.invoice_id, alreadyExisted: result.already_existed === true };
}

/** Create a new draft or update an existing one. Totals are always recomputed here. */
export async function saveInvoiceDraft(
  raw: InvoiceFormValues,
  invoiceId?: string | null,
): Promise<ActionResult<{ invoiceId: string; number: number; created: boolean }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;

  const parsed = invoiceInputSchema.safeParse(raw);
  if (!parsed.success) return failure("Check the highlighted fields.", fieldErrorsFromIssues(parsed.error.issues));
  const input = parsed.data;

  let existing: { id: string; number: number } | null = null;
  if (invoiceId) {
    if (!idSchema.safeParse(invoiceId).success) return failure("That invoice no longer exists.");
    const { data } = await ctx.supabase
      .from("invoices")
      .select("id, number, status")
      .eq("id", invoiceId)
      .eq("business_id", ctx.business.id)
      .maybeSingle();
    if (!data) return failure("That invoice no longer exists.");
    if (data.status !== "draft") return failure(NOT_EDITABLE);
    existing = { id: data.id, number: data.number };
  }

  const customer = await resolveCustomer(ctx, input.customer);
  if ("error" in customer) return customer.error;

  const payload = buildInvoicePayload(
    {
      customerId: customer.id,
      title: input.title,
      notes: input.notes,
      issueDate: input.issue_date,
      dueDate: input.due_date,
      items: input.items satisfies DocItem[],
    },
    businessSnapshot(ctx.business),
  );

  let id = existing?.id ?? null;
  let number = existing?.number ?? 0;
  const created = !existing;

  if (!existing) {
    const allocated = await allocateNumber(ctx, "invoice");
    if (allocated === null) return failure("We couldn't number the invoice. Try again.");
    number = allocated;

    const { data: shell, error } = await ctx.supabase
      .from("invoices")
      .insert({
        business_id: ctx.business.id,
        customer_id: customer.id,
        number,
        status: "draft",
        currency: payload.fields.currency as Business["currency"],
        tax_rate_bps: payload.fields.tax_rate_bps,
        issue_date: input.issue_date,
        due_date: input.due_date,
      })
      .select("id")
      .single();
    if (error || !shell) return failure("We couldn't create the invoice. Try again.");
    id = shell.id;
  }

  const { error: saveError } = await ctx.supabase.rpc("save_invoice", {
    p_invoice_id: id!,
    p_fields: payload.fields,
    p_items: payload.items,
  });
  if (saveError) {
    // Don't leave an empty shell behind when the very first save fails.
    if (created) await ctx.supabase.from("invoices").delete().eq("id", id!).eq("business_id", ctx.business.id);
    const message = saveError.code === "55000" ? NOT_EDITABLE : invoiceErrorMessage(saveError, "We couldn't save the invoice. Try again.");
    return failure(message);
  }

  if (created) await logActivity(ctx, id!, "invoice.created", {});
  revalidateInvoice(id!);
  return { ok: true, invoiceId: id!, number, created };
}

/** A new draft copied from any invoice of this business. */
export async function duplicateInvoice(sourceId: string): Promise<ActionResult<{ invoiceId: string; number: number }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(sourceId).success) return failure("That invoice no longer exists.");

  const { data: source } = await ctx.supabase
    .from("invoices")
    .select("id, number, customer_id, title, notes")
    .eq("id", sourceId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!source) return failure("That invoice no longer exists.");

  const { data: sourceItems } = await ctx.supabase
    .from("invoice_items")
    .select("description, type, qty, unit_rate_cents, price_item_id, needs_price")
    .eq("invoice_id", source.id)
    .order("position");

  const payload = buildInvoiceDuplicatePayload(
    source,
    sourceItems ?? [],
    { ...businessSnapshot(ctx.business), paymentTermsDays: ctx.business.payment_terms_days },
    todayInTimezone(ctx.business.timezone),
  );

  const number = await allocateNumber(ctx, "invoice");
  if (number === null) return failure("We couldn't number the new invoice. Try again.");

  const { data: shell, error } = await ctx.supabase
    .from("invoices")
    .insert({
      business_id: ctx.business.id,
      customer_id: source.customer_id,
      number,
      status: "draft",
      currency: payload.fields.currency as Business["currency"],
      tax_rate_bps: payload.fields.tax_rate_bps,
      issue_date: payload.fields.issue_date,
      due_date: payload.fields.due_date,
    })
    .select("id")
    .single();
  if (error || !shell) return failure("We couldn't duplicate the invoice. Try again.");

  const { error: saveError } = await ctx.supabase.rpc("save_invoice", {
    p_invoice_id: shell.id,
    p_fields: payload.fields,
    p_items: payload.items,
  });
  if (saveError) {
    await ctx.supabase.from("invoices").delete().eq("id", shell.id).eq("business_id", ctx.business.id);
    return failure(invoiceErrorMessage(saveError, "We couldn't duplicate the invoice. Try again."));
  }

  await logActivity(ctx, shell.id, "invoice.duplicated", { from: source.id, from_number: source.number });
  revalidateInvoice(shell.id);
  return { ok: true, invoiceId: shell.id, number };
}

/** Delete a draft. Invoices that were ever sent are voided, never deleted. */
export async function deleteDraftInvoice(invoiceId: string): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(invoiceId).success) return failure("That invoice no longer exists.");

  const { data: invoice } = await ctx.supabase
    .from("invoices")
    .select("id, status, amount_paid_cents")
    .eq("id", invoiceId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!invoice) return failure("That invoice no longer exists.");
  if (invoice.status !== "draft" || invoice.amount_paid_cents > 0) return failure("Only drafts can be deleted.");

  // invoice_items go with the invoice (ON DELETE CASCADE).
  const { data: deleted, error } = await ctx.supabase
    .from("invoices")
    .delete()
    .eq("id", invoiceId)
    .eq("business_id", ctx.business.id)
    .eq("status", "draft")
    .select("id");
  if (error) return failure("We couldn't delete the draft. Try again.");
  if (!deleted || deleted.length === 0) return failure("Only drafts can be deleted.");

  revalidateInvoice(invoiceId);
  return { ok: true };
}
