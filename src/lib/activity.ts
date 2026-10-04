import { describeInvoiceActivity } from "./invoice-helpers";
import { describeActivity } from "./quote-helpers";

type Meta = Record<string, unknown> | null | undefined;

/** Wording for customer activity rows. */
export function describeCustomerActivity(event: string): string {
  switch (event) {
    case "customer.created":
      return "Customer added";
    case "customer.updated":
      return "Customer details updated";
    case "customer.archived":
      return "Customer archived";
    case "customer.unarchived":
      return "Customer restored";
    default:
      return event.replace(/^[a-z]+\./, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
}

/**
 * One feed for a customer: quote, invoice and customer events, each prefixed with what it is about
 * when `withSubject` is set (e.g. "Estimate #1047: Estimate sent by link").
 */
export function describeAnyActivity(
  event: string,
  meta: Meta,
  ctx: { quoteWord: string; money: (cents: number) => string; subject?: string | null },
): string {
  let text: string;
  if (event.startsWith("invoice.")) text = describeInvoiceActivity(event, meta, ctx.money);
  else if (event.startsWith("customer.")) text = describeCustomerActivity(event);
  else text = describeActivity(event, meta, ctx.quoteWord);
  return ctx.subject ? `${ctx.subject}: ${text}` : text;
}
