"use server";

import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import { fieldErrorsFromIssues } from "@/lib/forms";
import { isOwnLogoPath } from "@/lib/logo";
import {
  numberingSchema,
  paymentLinkSchema,
  profileSchema,
  regionalSchema,
  type NumberingInput,
  type PaymentLinkInput,
  type ProfileInput,
  type RegionalInput,
} from "@/lib/schemas/settings";
import type { TablesUpdate } from "@/lib/supabase/tables";
import { actionBusinessContext } from "./context";

/**
 * Every settings section follows the same shape: validate with its zod schema,
 * then update ONLY the whitelisted columns that schema outputs. plan, billing,
 * country and currency are not in any schema, so they can never be written here.
 */
async function saveSection<TInput, TOutput extends object>(
  schema: ZodType<TOutput, TInput>,
  raw: TInput,
  toColumns: (data: TOutput) => TablesUpdate<"businesses">,
  after?: (data: TOutput, ctx: Extract<Awaited<ReturnType<typeof actionBusinessContext>>, { ok: true }>) => Promise<void>,
): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return failure("Check the highlighted fields.", fieldErrorsFromIssues(parsed.error.issues));

  const { error } = await ctx.supabase
    .from("businesses")
    .update(toColumns(parsed.data))
    .eq("id", ctx.business.id);
  if (error) return failure("We couldn't save your changes. Try again.");

  if (after) await after(parsed.data, ctx);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateProfile(raw: ProfileInput): Promise<ActionResult> {
  return saveSection(
    profileSchema,
    raw,
    (data) => ({
      name: data.name,
      trade: data.trade,
      email: data.email,
      phone: data.phone || null,
      address_line1: data.address_line1 || null,
      city: data.city || null,
      region: data.region || null,
      postcode: data.postcode || null,
    }),
    // The person's own name lives in their auth profile, shown in the sidebar.
    async (data, ctx) => {
      await ctx.supabase.auth.updateUser({ data: { full_name: data.owner_name } });
    },
  );
}

export async function updateRegional(raw: RegionalInput): Promise<ActionResult> {
  return saveSection(regionalSchema, raw, (data) => ({
    tax_enabled: data.tax_enabled,
    tax_label: data.tax_label,
    tax_rate_bps: data.tax_rate_bps,
    tax_number: data.tax_number,
  }));
}

export async function updateNumbering(raw: NumberingInput): Promise<ActionResult> {
  return saveSection(numberingSchema, raw, (data) => ({
    quote_prefix: data.quote_prefix,
    invoice_prefix: data.invoice_prefix,
    default_hourly_rate_cents: data.default_hourly_rate_cents,
    callout_fee_cents: data.callout_fee_cents,
    payment_terms_days: data.payment_terms_days,
    quote_validity_days: data.quote_validity_days,
  }));
}

export async function updatePaymentLink(raw: PaymentLinkInput): Promise<ActionResult> {
  return saveSection(paymentLinkSchema, raw, (data) => ({ payment_link_url: data.payment_link_url }));
}

/**
 * Called after the browser uploaded a logo straight to storage (user client + RLS
 * policies). Records the new path and removes the previous file. `null` removes the logo.
 */
export async function setLogoPath(path: string | null): Promise<ActionResult<{ logoPath: string | null }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;

  if (path !== null && !isOwnLogoPath(path, ctx.business.id)) return failure("That logo upload isn't valid.");

  const previous = ctx.business.logo_path;
  const { error } = await ctx.supabase.from("businesses").update({ logo_path: path }).eq("id", ctx.business.id);
  if (error) return failure("We couldn't save your logo. Try again.");

  if (previous && previous !== path) {
    // Best effort: a leftover file is harmless.
    await ctx.supabase.storage.from("logos").remove([previous]);
  }

  revalidatePath("/", "layout");
  return { ok: true, logoPath: path };
}
