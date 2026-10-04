import { z } from "zod";
import { Check } from "./fields";
import { MAX_ITEMS, checkCustomer, checkItems, customerShape, itemShape } from "./document-parts";

/**
 * Invoice form schema (builder + save action). Raw strings in, cents / null out.
 * Totals are NOT part of the input: the server always recomputes them.
 */
export const invoiceInputSchema = z
  .object({
    customer: customerShape,
    title: z.string(),
    notes: z.string(),
    issue_date: z.string(),
    due_date: z.string(),
    items: z.array(itemShape).max(MAX_ITEMS, `An invoice can have up to ${MAX_ITEMS} items.`),
  })
  .transform((v, ctx) => {
    const c = new Check();
    const issue = c.date("issue_date", v.issue_date);
    const due = c.date("due_date", v.due_date);
    if (!issue) c.fail("issue_date", "Choose an issue date.");
    if (!due) c.fail("due_date", "Choose a due date.");
    if (issue && due && due < issue) c.fail("due_date", "The due date can't be before the issue date.");

    const out = {
      customer: checkCustomer(c, v.customer),
      title: c.text("title", v.title, { label: "a title", max: 120 }) || null,
      notes: c.text("notes", v.notes, { label: "notes", max: 2000 }) || null,
      issue_date: issue ?? "",
      due_date: due ?? "",
      items: checkItems(c, v.items),
    };
    return c.done(ctx, out);
  });

export type InvoiceFormValues = z.input<typeof invoiceInputSchema>;
export type InvoiceInput = z.output<typeof invoiceInputSchema>;
