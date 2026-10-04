"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import { fieldErrorsFromIssues } from "@/lib/forms";
import { todayInTimezone } from "@/lib/quote-calc";
import {
  buildDuplicatePayload,
  buildSavePayload,
  type DocItem,
} from "@/lib/quote-helpers";
import { isValidVoicePath } from "@/lib/voice";
import { quoteInputSchema, type QuoteFormValues } from "@/lib/schemas/quote";
import type { Business } from "@/lib/supabase/tables";
import { allocateNumber, resolveCustomer, type Ctx } from "@/server/customer-resolver";
import { actionBusinessContext } from "./context";

const idSchema = z.uuid();
const NOT_EDITABLE = "This quote has already been sent, so it can't be edited. Duplicate it to make changes.";

function revalidateQuote(id?: string) {
  revalidatePath("/quotes");
  if (id) {
    revalidatePath(`/quotes/${id}`);
    revalidatePath(`/quotes/${id}/edit`);
  }
}

function businessSnapshot(business: Business) {
  return { taxEnabled: business.tax_enabled, taxRateBps: business.tax_rate_bps, currency: business.currency };
}

/** Turn a database error from save_quote into something a person can act on. */
function saveErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === "55000") return NOT_EDITABLE;
  if (error.code === "42501") return "That quote no longer exists.";
  if (error.code === "PGRST202" || /save_quote/.test(error.message ?? "") && /not find|does not exist/i.test(error.message ?? "")) {
    return "The database needs its latest update (migration 005_save_quote.sql) before quotes can be saved.";
  }
  return "We couldn't save the quote. Try again.";
}

async function logActivity(ctx: Ctx, quoteId: string, event: string, meta: Record<string, string | number>) {
  // The audit trail is best effort: never fail a save because of it.
  await ctx.supabase.from("activity").insert({
    business_id: ctx.business.id,
    entity_type: "quote",
    entity_id: quoteId,
    event,
    meta,
  });
}

/** Create a new draft or update an existing one. Totals are always recomputed here. */
export async function saveQuoteDraft(
  raw: QuoteFormValues,
  quoteId?: string | null,
): Promise<ActionResult<{ quoteId: string; number: number; created: boolean }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;

  const parsed = quoteInputSchema.safeParse(raw);
  if (!parsed.success) return failure("Check the highlighted fields.", fieldErrorsFromIssues(parsed.error.issues));
  const input = parsed.data;

  // A voice note must live in this business's own folder.
  if (input.voice_note_path && !isValidVoicePath(input.voice_note_path, ctx.business.id)) {
    return failure("That voice note isn't valid. Record it again.");
  }

  let existing: { id: string; number: number } | null = null;
  if (quoteId) {
    if (!idSchema.safeParse(quoteId).success) return failure("That quote no longer exists.");
    const { data } = await ctx.supabase
      .from("quotes")
      .select("id, number, status")
      .eq("id", quoteId)
      .eq("business_id", ctx.business.id)
      .maybeSingle();
    if (!data) return failure("That quote no longer exists.");
    if (data.status !== "draft") return failure(NOT_EDITABLE);
    existing = { id: data.id, number: data.number };
  }

  const customer = await resolveCustomer(ctx, input.customer);
  if ("error" in customer) return customer.error;

  const payload = buildSavePayload(
    {
      customerId: customer.id,
      title: input.title,
      notes: input.notes,
      validUntil: input.valid_until,
      depositEnabled: input.deposit_enabled,
      depositBps: input.deposit_bps,
      includePhotos: input.include_photos,
      items: input.items satisfies DocItem[],
      voice:
        input.voice_note_path === undefined && input.transcript === undefined
          ? undefined
          : { path: input.voice_note_path ?? null, transcript: input.transcript ?? null },
    },
    businessSnapshot(ctx.business),
  );

  let id = existing?.id ?? null;
  let number = existing?.number ?? 0;
  const created = !existing;

  if (!existing) {
    const allocated = await allocateNumber(ctx, "quote");
    if (allocated === null) return failure("We couldn't number the quote. Try again.");
    number = allocated;

    const { data: shell, error } = await ctx.supabase
      .from("quotes")
      .insert({
        business_id: ctx.business.id,
        customer_id: customer.id,
        number,
        status: "draft",
        currency: payload.fields.currency as Business["currency"],
        tax_rate_bps: payload.fields.tax_rate_bps,
      })
      .select("id")
      .single();
    if (error || !shell) return failure("We couldn't create the quote. Try again.");
    id = shell.id;
  }

  const { error: saveError } = await ctx.supabase.rpc("save_quote", {
    p_quote_id: id!,
    p_fields: payload.fields,
    p_items: payload.items,
  });
  if (saveError) {
    // Don't leave an empty shell behind when the very first save fails.
    if (created) await ctx.supabase.from("quotes").delete().eq("id", id!).eq("business_id", ctx.business.id);
    return failure(saveErrorMessage(saveError));
  }

  if (created) await logActivity(ctx, id!, "quote.created", { number });
  revalidateQuote(id!);
  return { ok: true, quoteId: id!, number, created };
}

/** A new draft copied from any quote of this business. */
export async function duplicateQuote(sourceId: string): Promise<ActionResult<{ quoteId: string; number: number }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(sourceId).success) return failure("That quote no longer exists.");

  const { data: source } = await ctx.supabase
    .from("quotes")
    .select("id, number, customer_id, title, notes, deposit_enabled, deposit_bps, include_photos")
    .eq("id", sourceId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!source) return failure("That quote no longer exists.");

  const { data: sourceItems } = await ctx.supabase
    .from("quote_items")
    .select("description, type, qty, unit_rate_cents, price_item_id, needs_price")
    .eq("quote_id", source.id)
    .order("position");

  const payload = buildDuplicatePayload(
    source,
    sourceItems ?? [],
    { ...businessSnapshot(ctx.business), quoteValidityDays: ctx.business.quote_validity_days },
    todayInTimezone(ctx.business.timezone),
  );

  const number = await allocateNumber(ctx, "quote");
  if (number === null) return failure("We couldn't number the new quote. Try again.");

  const { data: shell, error } = await ctx.supabase
    .from("quotes")
    .insert({
      business_id: ctx.business.id,
      customer_id: source.customer_id,
      number,
      status: "draft",
      currency: payload.fields.currency as Business["currency"],
      tax_rate_bps: payload.fields.tax_rate_bps,
    })
    .select("id")
    .single();
  if (error || !shell) return failure("We couldn't duplicate the quote. Try again.");

  const { error: saveError } = await ctx.supabase.rpc("save_quote", {
    p_quote_id: shell.id,
    p_fields: payload.fields,
    p_items: payload.items,
  });
  if (saveError) {
    await ctx.supabase.from("quotes").delete().eq("id", shell.id).eq("business_id", ctx.business.id);
    return failure(saveErrorMessage(saveError));
  }

  await logActivity(ctx, shell.id, "quote.duplicated", { from: source.id, from_number: source.number, number });
  revalidateQuote(shell.id);
  return { ok: true, quoteId: shell.id, number };
}

/** Delete a draft and its photos. Quotes that were ever sent are never deleted. */
export async function deleteDraftQuote(quoteId: string): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(quoteId).success) return failure("That quote no longer exists.");

  const { data: quote } = await ctx.supabase
    .from("quotes")
    .select("id, status, voice_note_path")
    .eq("id", quoteId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!quote) return failure("That quote no longer exists.");
  if (quote.status !== "draft") return failure("Only drafts can be deleted.");

  const { data: photos } = await ctx.supabase
    .from("job_photos")
    .select("storage_path")
    .eq("quote_id", quoteId)
    .eq("business_id", ctx.business.id);
  const paths = (photos ?? []).map((p) => p.storage_path);
  if (paths.length > 0) await ctx.supabase.storage.from("job-photos").remove(paths);
  // The recording goes with the draft (only if it is inside this business's folder).
  if (quote.voice_note_path && isValidVoicePath(quote.voice_note_path, ctx.business.id)) {
    await ctx.supabase.storage.from("voice-notes").remove([quote.voice_note_path]);
  }

  // quote_items and job_photos rows go with the quote (ON DELETE CASCADE).
  const { data: deleted, error } = await ctx.supabase
    .from("quotes")
    .delete()
    .eq("id", quoteId)
    .eq("business_id", ctx.business.id)
    .eq("status", "draft")
    .select("id");
  if (error) return failure("We couldn't delete the draft. Try again.");
  if (!deleted || deleted.length === 0) return failure("Only drafts can be deleted.");

  revalidateQuote(quoteId);
  return { ok: true };
}
