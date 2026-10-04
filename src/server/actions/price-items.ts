"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import { fieldErrorsFromIssues } from "@/lib/forms";
import { priceItemSchema, type PriceItemInput } from "@/lib/schemas/price-item";
import { actionBusinessContext } from "./context";

const idSchema = z.uuid();

/** Add a price-book item to the signed-in user's business. */
export async function createPriceItem(raw: PriceItemInput): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;

  const parsed = priceItemSchema.safeParse(raw);
  if (!parsed.success) return failure("Check the highlighted fields.", fieldErrorsFromIssues(parsed.error.issues));

  const { error } = await ctx.supabase
    .from("price_items")
    .insert({ ...parsed.data, business_id: ctx.business.id });
  if (error) return failure("We couldn't save that item. Try again.");

  revalidatePath("/price-book");
  return { ok: true };
}

export async function updatePriceItem(id: string, raw: PriceItemInput): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(id).success) return failure("That item no longer exists.");

  const parsed = priceItemSchema.safeParse(raw);
  if (!parsed.success) return failure("Check the highlighted fields.", fieldErrorsFromIssues(parsed.error.issues));

  const { data, error } = await ctx.supabase
    .from("price_items")
    .update(parsed.data)
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .select("id");
  if (error) return failure("We couldn't save that item. Try again.");
  if (!data || data.length === 0) return failure("That item no longer exists.");

  revalidatePath("/price-book");
  return { ok: true };
}

/** Archive or restore. Items are never hard-deleted, so old quotes keep their references. */
export async function setPriceItemArchived(id: string, archived: boolean): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(id).success) return failure("That item no longer exists.");

  const { data, error } = await ctx.supabase
    .from("price_items")
    .update({ archived })
    .eq("id", id)
    .eq("business_id", ctx.business.id)
    .select("id");
  if (error) return failure("We couldn't update that item. Try again.");
  if (!data || data.length === 0) return failure("That item no longer exists.");

  revalidatePath("/price-book");
  return { ok: true };
}
