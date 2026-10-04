"use server";

import { revalidatePath } from "next/cache";
import { failure, type ActionResult } from "@/lib/action-result";
import { REGIONS, resolveTimezone } from "@/lib/region";
import {
  parseOnboarding,
  step1Schema,
  type OnboardingInput,
  type Step1Input,
  type Step1Output,
} from "@/lib/schemas/onboarding";
import { fieldErrorsFromIssues } from "@/lib/forms";
import type { Business, TablesInsert } from "@/lib/supabase/tables";
import { tradeSeedItems } from "@/lib/trade-seeds";
import { actionContext } from "./context";

type Supabase = Extract<Awaited<ReturnType<typeof actionContext>>, { ok: true }>["supabase"];

function step1Columns(data: Step1Output) {
  const region = REGIONS[data.country];
  return {
    name: data.name,
    trade: data.trade,
    country: data.country,
    currency: region.currency,
    timezone: resolveTimezone(data.country, data.timezone),
    tax_label: region.taxLabel,
    phone: data.phone,
    email: data.email,
  };
}

/** Create the user's business on first save, or update it if a draft exists. */
async function upsertBusiness(
  supabase: Supabase,
  userId: string,
  data: Step1Output,
): Promise<{ business: Pick<Business, "id" | "onboarded_at"> } | { error: string }> {
  const { data: existing } = await supabase.from("businesses").select("id, onboarded_at").maybeSingle();
  const columns = step1Columns(data);

  if (existing) {
    if (existing.onboarded_at) return { error: "Your business is already set up." };
    const { error } = await supabase.from("businesses").update(columns).eq("id", existing.id);
    if (error) return { error: "We couldn't save your business. Try again." };
    return { business: existing };
  }

  const row: TablesInsert<"businesses"> = { owner_id: userId, ...columns };
  const { data: created, error } = await supabase
    .from("businesses")
    .insert(row)
    .select("id, onboarded_at")
    .single();
  if (error || !created) return { error: "We couldn't save your business. Try again." };
  return { business: created };
}

/** Step 1 -> Continue. Saves the business so a logo can be uploaded under its id. */
export async function saveBusinessStep(raw: Step1Input): Promise<ActionResult<{ businessId: string }>> {
  const ctx = await actionContext();
  if (!ctx.ok) return ctx.error;

  const parsed = step1Schema.safeParse(raw);
  if (!parsed.success) return failure("Check the highlighted fields.", fieldErrorsFromIssues(parsed.error.issues));

  const saved = await upsertBusiness(ctx.supabase, ctx.user.id, parsed.data);
  if ("error" in saved) return failure(saved.error);
  return { ok: true, businessId: saved.business.id };
}

/** Final step. Validates everything again, seeds starter items, then marks onboarding done. */
export async function completeOnboarding(raw: OnboardingInput): Promise<ActionResult> {
  const ctx = await actionContext();
  if (!ctx.ok) return ctx.error;

  const parsed = parseOnboarding(raw);
  if (!parsed.ok) return failure("Check the highlighted fields.", parsed.errors);
  const data = parsed.data;

  const saved = await upsertBusiness(ctx.supabase, ctx.user.id, data);
  if ("error" in saved) return failure(saved.error);
  const businessId = saved.business.id;

  // Seed starter price items once. On a retry the items already exist, so skip.
  const { data: existingItems } = await ctx.supabase.from("price_items").select("id").limit(1);
  if (!existingItems || existingItems.length === 0) {
    const items = tradeSeedItems({
      trade: data.trade,
      country: data.country,
      hourlyRateCents: data.default_hourly_rate_cents,
      calloutFeeCents: data.callout_fee_cents,
    });
    const { error } = await ctx.supabase
      .from("price_items")
      .insert(items.map((item) => ({ ...item, business_id: businessId })));
    if (error) return failure("We couldn't create your starter price book. Try again.");
  }

  // onboarded_at goes last so a failure above leaves the wizard resumable.
  const { error } = await ctx.supabase
    .from("businesses")
    .update({
      default_hourly_rate_cents: data.default_hourly_rate_cents,
      callout_fee_cents: data.callout_fee_cents,
      tax_enabled: data.tax_enabled,
      tax_rate_bps: data.tax_rate_bps,
      tax_number: data.tax_number,
      payment_terms_days: data.payment_terms_days,
      quote_validity_days: data.quote_validity_days,
      payment_link_url: data.payment_link_url,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", businessId);
  if (error) return failure("We couldn't finish setting up. Try again.");

  revalidatePath("/", "layout");
  return { ok: true };
}
