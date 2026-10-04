/**
 * Database types, hand-written to match supabase/migrations/001-004 exactly.
 *
 * Regenerate from your live database with:
 *   supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
 * or simply `pnpm db:types` (reads SUPABASE_PROJECT_ID from .env.local).
 *
 * Note: the CLI types CHECK-constrained columns as plain `string`. The literal
 * unions below are narrower, so after regenerating you may need to narrow
 * values (see `src/lib/supabase/tables.ts` for the shared aliases).
 * Money is integer cents, tax is basis points. `numeric(10,2)` columns are `number`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Country = "US" | "UK" | "AU";
type Currency = "USD" | "GBP" | "AUD";
type Plan = "trial" | "free" | "pro" | "business";
type ItemType = "labour" | "material" | "fee";
type ItemUnit = "job" | "hour" | "item" | "m2" | "m" | "day";
type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
type InvoiceStatus = "draft" | "sent" | "viewed" | "paid" | "void";
type PaymentMethod = "cash" | "card" | "bank_transfer" | "other";
type PhotoKind = "before" | "after" | "other";
type ActivityEntity = "quote" | "invoice" | "customer";

/** Insert shape: columns in `Optional` have DB defaults (or are nullable) and may be omitted. */
type Insertable<Row, Optional extends keyof Row> = Omit<Row, Optional> & Partial<Pick<Row, Optional>>;

type BusinessRow = {
  id: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  name: string;
  trade: string | null;
  logo_path: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: Country;
  currency: Currency;
  timezone: string;
  tax_enabled: boolean;
  tax_label: string;
  tax_rate_bps: number;
  tax_number: string | null;
  default_hourly_rate_cents: number;
  callout_fee_cents: number;
  payment_terms_days: number;
  quote_validity_days: number;
  payment_link_url: string | null;
  quote_prefix: string;
  invoice_prefix: string;
  next_quote_number: number;
  next_invoice_number: number;
  reminders_enabled: boolean;
  quote_followup_template: string | null;
  invoice_reminder_template: string | null;
  plan: Plan;
  trial_ends_at: string | null;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  onboarded_at: string | null;
};

type CustomerRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  notes: string | null;
};

type PriceItemRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_id: string;
  name: string;
  type: ItemType;
  unit: ItemUnit;
  rate_cents: number;
  markup_bps: number;
  archived: boolean;
};

type QuoteRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_id: string;
  customer_id: string | null;
  number: number;
  title: string | null;
  status: QuoteStatus;
  notes: string | null;
  terms: string | null;
  valid_until: string | null;
  deposit_enabled: boolean;
  deposit_bps: number;
  include_photos: boolean;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: Currency;
  tax_rate_bps: number;
  public_token: string;
  voice_note_path: string | null;
  transcript: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_ip: string | null;
  accepted_user_agent: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  followup_count: number;
  last_followup_at: string | null;
  scheduled_for: string | null;
};

type QuoteItemRow = {
  id: string;
  created_at: string;
  updated_at: string;
  quote_id: string;
  position: number;
  description: string;
  type: ItemType;
  qty: number;
  unit_rate_cents: number;
  amount_cents: number;
  price_item_id: string | null;
  needs_price: boolean;
};

type InvoiceRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_id: string;
  customer_id: string | null;
  quote_id: string | null;
  number: number;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  notes: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  currency: Currency;
  tax_rate_bps: number;
  public_token: string;
  sent_at: string | null;
  viewed_at: string | null;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  reminder_count: number;
  last_reminder_at: string | null;
};

type InvoiceItemRow = {
  id: string;
  created_at: string;
  updated_at: string;
  invoice_id: string;
  position: number;
  description: string;
  type: ItemType;
  qty: number;
  unit_rate_cents: number;
  amount_cents: number;
  price_item_id: string | null;
  needs_price: boolean;
};

type JobPhotoRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_id: string;
  quote_id: string | null;
  invoice_id: string | null;
  storage_path: string;
  kind: PhotoKind;
  position: number;
};

type ActivityRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_id: string;
  entity_type: ActivityEntity;
  entity_id: string;
  event: string;
  meta: Json;
};

type UsageCounterRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_id: string;
  period: string;
  quotes_sent: number;
  ai_drafts: number;
};

type RateLimitRow = {
  id: string;
  created_at: string;
  updated_at: string;
  ip: string;
  key: string;
  window_start: string;
  count: number;
};

type Rel<Table extends string, Column extends string, RefTable extends string> = {
  foreignKeyName: `${Table}_${Column}_fkey`;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: RefTable;
  referencedColumns: ["id"];
};

type Common = "id" | "created_at" | "updated_at";

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: BusinessRow;
        Insert: Insertable<
          BusinessRow,
          | Common
          | "trade" | "logo_path" | "phone" | "email" | "address_line1" | "city" | "region" | "postcode"
          | "timezone" | "tax_enabled" | "tax_label" | "tax_rate_bps" | "tax_number"
          | "default_hourly_rate_cents" | "callout_fee_cents" | "payment_terms_days" | "quote_validity_days"
          | "payment_link_url" | "quote_prefix" | "invoice_prefix" | "next_quote_number" | "next_invoice_number"
          | "reminders_enabled" | "quote_followup_template" | "invoice_reminder_template"
          | "plan" | "trial_ends_at" | "paddle_customer_id" | "paddle_subscription_id" | "onboarded_at"
        >;
        Update: Partial<BusinessRow>;
        Relationships: [];
      };
      customers: {
        Row: CustomerRow;
        Insert: Insertable<
          CustomerRow,
          Common | "email" | "phone" | "address_line1" | "city" | "region" | "postcode" | "notes"
        >;
        Update: Partial<CustomerRow>;
        Relationships: [Rel<"customers", "business_id", "businesses">];
      };
      price_items: {
        Row: PriceItemRow;
        Insert: Insertable<PriceItemRow, Common | "rate_cents" | "markup_bps" | "archived">;
        Update: Partial<PriceItemRow>;
        Relationships: [Rel<"price_items", "business_id", "businesses">];
      };
      quotes: {
        Row: QuoteRow;
        Insert: Insertable<
          QuoteRow,
          | Common
          | "customer_id" | "title" | "status" | "notes" | "terms" | "valid_until"
          | "deposit_enabled" | "deposit_bps" | "include_photos"
          | "subtotal_cents" | "tax_cents" | "total_cents" | "tax_rate_bps" | "public_token"
          | "voice_note_path" | "transcript" | "sent_at" | "viewed_at" | "accepted_at" | "accepted_name"
          | "accepted_ip" | "accepted_user_agent" | "declined_at" | "decline_reason"
          | "followup_count" | "last_followup_at" | "scheduled_for"
        >;
        Update: Partial<QuoteRow>;
        Relationships: [
          Rel<"quotes", "business_id", "businesses">,
          Rel<"quotes", "customer_id", "customers">,
        ];
      };
      quote_items: {
        Row: QuoteItemRow;
        Insert: Insertable<
          QuoteItemRow,
          Common | "position" | "type" | "qty" | "unit_rate_cents" | "amount_cents" | "price_item_id" | "needs_price"
        >;
        Update: Partial<QuoteItemRow>;
        Relationships: [
          Rel<"quote_items", "quote_id", "quotes">,
          Rel<"quote_items", "price_item_id", "price_items">,
        ];
      };
      invoices: {
        Row: InvoiceRow;
        Insert: Insertable<
          InvoiceRow,
          | Common
          | "customer_id" | "quote_id" | "status" | "issue_date" | "due_date" | "notes"
          | "subtotal_cents" | "tax_cents" | "total_cents" | "amount_paid_cents" | "tax_rate_bps" | "public_token"
          | "sent_at" | "viewed_at" | "paid_at" | "payment_method" | "reminder_count" | "last_reminder_at"
        >;
        Update: Partial<InvoiceRow>;
        Relationships: [
          Rel<"invoices", "business_id", "businesses">,
          Rel<"invoices", "customer_id", "customers">,
          Rel<"invoices", "quote_id", "quotes">,
        ];
      };
      invoice_items: {
        Row: InvoiceItemRow;
        Insert: Insertable<
          InvoiceItemRow,
          Common | "position" | "type" | "qty" | "unit_rate_cents" | "amount_cents" | "price_item_id" | "needs_price"
        >;
        Update: Partial<InvoiceItemRow>;
        Relationships: [
          Rel<"invoice_items", "invoice_id", "invoices">,
          Rel<"invoice_items", "price_item_id", "price_items">,
        ];
      };
      job_photos: {
        Row: JobPhotoRow;
        Insert: Insertable<JobPhotoRow, Common | "quote_id" | "invoice_id" | "kind" | "position">;
        Update: Partial<JobPhotoRow>;
        Relationships: [
          Rel<"job_photos", "business_id", "businesses">,
          Rel<"job_photos", "quote_id", "quotes">,
          Rel<"job_photos", "invoice_id", "invoices">,
        ];
      };
      activity: {
        Row: ActivityRow;
        Insert: Insertable<ActivityRow, Common | "meta">;
        Update: Partial<ActivityRow>;
        Relationships: [Rel<"activity", "business_id", "businesses">];
      };
      usage_counters: {
        Row: UsageCounterRow;
        Insert: Insertable<UsageCounterRow, Common | "quotes_sent" | "ai_drafts">;
        Update: Partial<UsageCounterRow>;
        Relationships: [Rel<"usage_counters", "business_id", "businesses">];
      };
      rate_limits: {
        Row: RateLimitRow;
        Insert: Insertable<RateLimitRow, Common | "count">;
        Update: Partial<RateLimitRow>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      auth_business_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      next_doc_number: {
        Args: { p_business_id: string; p_kind: "quote" | "invoice" };
        Returns: number;
      };
      dashboard_stats: {
        Args: { p_business_id: string };
        Returns: {
          owed_cents: number;
          owed_count: number;
          awaiting_count: number;
          awaiting_value_cents: number;
          paid_this_month_cents: number;
          paid_last_month_cents: number;
          overdue_count: number;
          overdue_cents: number;
        }[];
      };
      monthly_invoice_totals: {
        Args: { p_business_id: string; p_months?: number };
        Returns: {
          month: string;
          paid_cents: number;
          outstanding_cents: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
