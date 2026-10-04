import type { Database } from "./types";

type PublicSchema = Database["public"];

/** Row / insert / update helpers, kept apart from types.ts so `pnpm db:types` can overwrite it. */
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];

export type Business = Tables<"businesses">;
export type Customer = Tables<"customers">;
export type PriceItem = Tables<"price_items">;
export type Quote = Tables<"quotes">;
export type QuoteItem = Tables<"quote_items">;
export type Invoice = Tables<"invoices">;
export type InvoiceItem = Tables<"invoice_items">;
export type JobPhoto = Tables<"job_photos">;
export type Activity = Tables<"activity">;
export type UsageCounter = Tables<"usage_counters">;

export type QuoteStatus = Quote["status"];
export type InvoiceStatus = Invoice["status"];
