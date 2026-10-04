import { z } from "zod";
import { Check } from "./fields";

/** Record-payment and void inputs. The amount arrives as text and is parsed to cents here. */

export const recordPaymentInputSchema = z
  .object({
    amount: z.string(),
    method: z.string(),
    paid_on: z.string(),
    note: z.string(),
    idempotency_key: z.string(),
  })
  .transform((v, ctx) => {
    const c = new Check();
    const amount_cents = c.money("amount", v.amount, { required: true, minCents: 1 });
    const method = c.oneOf("method", v.method, ["cash", "card", "bank_transfer", "cheque", "other"] as const, "Choose how it was paid.");
    const paid_on = c.date("paid_on", v.paid_on);
    if (!paid_on) c.fail("paid_on", "Enter the date it was paid.");
    const note = c.text("note", v.note, { label: "a note", max: 300 }) || null;
    const idempotency_key = z.uuid().safeParse(v.idempotency_key).success ? v.idempotency_key : null;
    if (!idempotency_key) c.fail("idempotency_key", "Something went wrong. Close this and try again.");
    return c.done(ctx, { amount_cents, method, paid_on: paid_on ?? "", note, idempotency_key: idempotency_key ?? "" });
  });

export type RecordPaymentFormValues = z.input<typeof recordPaymentInputSchema>;
export type RecordPaymentInput = z.output<typeof recordPaymentInputSchema>;

export const voidInputSchema = z
  .object({ reason: z.string() })
  .transform((v, ctx) => {
    const c = new Check();
    const reason = c.text("reason", v.reason, { label: "a reason", max: 300 }) || null;
    return c.done(ctx, { reason });
  });
