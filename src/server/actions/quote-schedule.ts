"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import { fieldErrorsFromIssues } from "@/lib/forms";
import { todayInTimezone } from "@/lib/quote-calc";
import { REGIONS } from "@/lib/region";
import { isReasonableScheduleDate, scheduleInputSchema, zonedToUtc } from "@/lib/schedule";
import { actionBusinessContext } from "./context";

const idSchema = z.uuid();

/**
 * Set (or clear, with null) the job date and time of an ACCEPTED quote. The date and time are the
 * owner's wall clock in the business timezone and are stored as a UTC timestamp.
 */
export async function setQuoteSchedule(quoteId: string, raw: { date: string; time: string } | null): Promise<ActionResult<{ scheduledFor: string | null }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(quoteId).success) return failure("That quote no longer exists.");

  const { data: quote } = await ctx.supabase.from("quotes").select("id, status").eq("id", quoteId).eq("business_id", ctx.business.id).maybeSingle();
  if (!quote) return failure("That quote no longer exists.");
  if (quote.status !== "accepted") return failure("Only an accepted quote can be scheduled.");

  let scheduledFor: Date | null = null;
  if (raw !== null) {
    const parsed = scheduleInputSchema.safeParse(raw);
    if (!parsed.success) return failure("Check the date and time.", fieldErrorsFromIssues(parsed.error.issues));
    if (!isReasonableScheduleDate(parsed.data.date, todayInTimezone(ctx.business.timezone))) {
      return failure("Choose a date within the last year or the next two years.", { date: "Choose a date within the last year or the next two years." });
    }
    scheduledFor = zonedToUtc(parsed.data.date, parsed.data.time, ctx.business.timezone);
  }

  const { data, error } = await ctx.supabase
    .from("quotes")
    .update({ scheduled_for: scheduledFor ? scheduledFor.toISOString() : null })
    .eq("id", quoteId)
    .eq("business_id", ctx.business.id)
    .eq("status", "accepted")
    .select("id");
  if (error) return failure("We couldn't save the schedule. Try again.");
  if (!data || data.length === 0) return failure("Only an accepted quote can be scheduled.");

  const when = scheduledFor
    ? new Intl.DateTimeFormat(REGIONS[ctx.business.country].locale, { timeZone: ctx.business.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(scheduledFor)
    : null;
  await ctx.supabase.from("activity").insert({ business_id: ctx.business.id, entity_type: "quote", entity_id: quoteId, event: "quote.scheduled", meta: when ? { when } : {} });

  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/dashboard");
  return { ok: true, scheduledFor: scheduledFor ? scheduledFor.toISOString() : null };
}
