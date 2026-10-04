"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import { fieldErrorsFromIssues } from "@/lib/forms";
import { remainingCents } from "@/lib/invoice-calc";
import { invoiceErrorMessage } from "@/lib/invoice-errors";
import { validatePaymentInput } from "@/lib/payments";
import { todayInTimezone } from "@/lib/quote-calc";
import { recordPaymentInputSchema, voidInputSchema, type RecordPaymentFormValues } from "@/lib/schemas/payment";
import { actionBusinessContext } from "./context";

const idSchema = z.uuid();

function revalidate(id: string) {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

export type RecordPaymentResult = ActionResult<{
  status: string;
  amountPaidCents: number;
  remainingCents: number;
  fullyPaid: boolean;
  duplicate: boolean;
}>;

/**
 * Record a payment. The amount is validated against the balance read here on the server
 * (never the one the browser showed), then recorded atomically by record_invoice_payment(),
 * which locks the invoice and ignores a repeat of the same idempotency key.
 */
export async function recordPayment(invoiceId: string, raw: RecordPaymentFormValues): Promise<RecordPaymentResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(invoiceId).success) return failure("That invoice no longer exists.");

  const parsed = recordPaymentInputSchema.safeParse(raw);
  if (!parsed.success) return failure("Check the highlighted fields.", fieldErrorsFromIssues(parsed.error.issues));
  const input = parsed.data;

  const { data: invoice } = await ctx.supabase
    .from("invoices")
    .select("id, status, total_cents, amount_paid_cents")
    .eq("id", invoiceId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!invoice) return failure("That invoice no longer exists.");
  if (invoice.status === "draft" || invoice.status === "void") return failure("Send the invoice before recording a payment.");
  if (invoice.status === "paid") return failure("This invoice is already paid.");

  const check = validatePaymentInput(
    input.amount_cents,
    remainingCents(invoice.total_cents, invoice.amount_paid_cents),
    input.method,
    input.paid_on,
    todayInTimezone(ctx.business.timezone),
  );
  if (!check.ok) {
    const field = check.field === "date" ? "paid_on" : check.field;
    return failure(check.message, { [field]: check.message });
  }

  const { data, error } = await ctx.supabase.rpc("record_invoice_payment", {
    p_invoice_id: invoiceId,
    p_amount_cents: input.amount_cents,
    p_method: input.method,
    p_paid_on: input.paid_on,
    p_note: input.note,
    p_idempotency_key: input.idempotency_key,
  });
  if (error) return failure(invoiceErrorMessage(error, "We couldn't record the payment. Try again."));

  const r = data as { status?: string; amount_paid_cents?: number; remaining_cents?: number; fully_paid?: boolean; duplicate?: boolean } | null;
  revalidate(invoiceId);
  return {
    ok: true,
    status: r?.status ?? invoice.status,
    amountPaidCents: r?.amount_paid_cents ?? invoice.amount_paid_cents,
    remainingCents: r?.remaining_cents ?? 0,
    fullyPaid: r?.fully_paid === true,
    duplicate: r?.duplicate === true,
  };
}

/** Void a draft or an untouched sent invoice. Refused once any payment is recorded. */
export async function voidInvoice(invoiceId: string, reason: string): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(invoiceId).success) return failure("That invoice no longer exists.");

  const parsed = voidInputSchema.safeParse({ reason });
  if (!parsed.success) return failure("Keep the reason under 300 characters.", fieldErrorsFromIssues(parsed.error.issues));

  const { data: invoice } = await ctx.supabase.from("invoices").select("id").eq("id", invoiceId).eq("business_id", ctx.business.id).maybeSingle();
  if (!invoice) return failure("That invoice no longer exists.");

  const { error } = await ctx.supabase.rpc("void_invoice", { p_invoice_id: invoiceId, p_reason: parsed.data.reason });
  if (error) return failure(invoiceErrorMessage(error, "We couldn't void the invoice. Try again."));

  revalidate(invoiceId);
  return { ok: true };
}
