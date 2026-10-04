/**
 * Turn a database error from the invoice functions (migration 009) into something a
 * person can act on. The functions raise plain English messages for the cases the owner
 * can fix (over-payment, wrong state), so those are passed through.
 */
export type DbError = { code?: string; message?: string } | null | undefined;

const MIGRATION_HINT = "The database needs its latest update (migration 009_invoices.sql) before this works.";

function missingFunction(error: NonNullable<DbError>): boolean {
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function|does not exist/i.test(error.message ?? "");
}

const SAFE_MESSAGE = /^(Enter an amount|Choose how|The payment date|That is more than|This invoice is already paid|Send the invoice|An invoice with payments|This invoice can't be voided|Only accepted quotes|Only draft invoices|The due date)/;

export function invoiceErrorMessage(error: NonNullable<DbError>, fallback: string, notFound = "That invoice no longer exists."): string {
  if (missingFunction(error)) return MIGRATION_HINT;
  if (error.code === "42501") return notFound;
  if (error.code === "23505") return "An invoice already exists for this estimate.";
  if (error.code === "55000" || error.code === "22023" || error.code === "22003") {
    const message = error.message ?? "";
    if (SAFE_MESSAGE.test(message)) return message;
    return fallback;
  }
  return fallback;
}
