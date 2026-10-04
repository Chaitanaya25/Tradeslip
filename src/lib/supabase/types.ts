/**
 * Database types, hand-written to match supabase/migrations/001-012 exactly.
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
type PaymentMethod = "cash" | "card" | "bank_transfer" | "cheque" | "other";
type PhotoKind = "before" | "after" | "other";
type SubscriptionStatus = "none" | "trialing" | "active" | "past_due" | "paused" | "canceled";
type ActivityEntity = "quote" | "invoice" | "customer" | "business";

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
  quote_followup_enabled: boolean;
  quote_followup_days: number;
  invoice_reminders_enabled: boolean;
  invoice_reminder_1_days: number;
  invoice_reminder_2_days: number;
  quote_followup_template: string | null;
  invoice_reminder_template: string | null;
  invoice_reminder_1_template: string | null;
  invoice_reminder_2_template: string | null;
  plan: Plan;
  trial_ends_at: string | null;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  billing_interval: "month" | "year" | null;
  paddle_price_id: string | null;
  last_billing_event_at: string | null;
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
  archived: boolean;
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
  accepted_verified: boolean;
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
  title: string | null;
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

type InvoicePaymentRow = {
  id: string;
  created_at: string;
  invoice_id: string;
  business_id: string;
  amount_cents: number;
  method: PaymentMethod;
  paid_on: string;
  note: string | null;
  idempotency_key: string | null;
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

type AcceptOtpRow = {
  id: string;
  quote_id: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  used_at: string | null;
  created_at: string;
};

type ReminderLogRow = {
  id: string;
  created_at: string;
  updated_at: string;
  business_id: string;
  entity_type: "quote" | "invoice";
  entity_id: string;
  kind: "quote_followup" | "invoice_reminder_1" | "invoice_reminder_2";
  status: "pending" | "sent" | "failed" | "skipped";
  reason: string | null;
  provider_message_id: string | null;
  number: number | null;
};

type UnsubscribedEmailRow = {
  business_id: string;
  email: string;
  created_at: string;
};

type BillingEventRow = {
  id: string;
  paddle_event_id: string;
  event_type: string;
  business_id: string | null;
  payload_summary: Json;
  processed_at: string | null;
  status: "processed" | "ignored" | "failed";
  error: string | null;
  created_at: string;
};

type BillingNoticeRow = {
  business_id: string;
  kind: "trial_ending" | "trial_ended";
  created_at: string;
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

/** Rows from list_due_quote_followups (cron only; includes the customer's email, which never leaves the server). */
type DueQuoteRow = {
  entity_id: string;
  business_id: string;
  number: number;
  number_prefix: string;
  total_cents: number;
  currency: Currency;
  valid_until: string | null;
  sent_at: string | null;
  public_token: string;
  followup_count: number;
  last_followup_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  business_name: string;
  business_email: string | null;
  country: Country;
  timezone: string;
  plan: Plan;
  logo_path: string | null;
  plan_branding: boolean;
  template: string | null;
  reminders_enabled: boolean;
  quote_followup_enabled: boolean;
  quote_followup_days: number;
  unsubscribed: boolean;
};

type DueInvoiceRow = {
  entity_id: string;
  business_id: string;
  number: number;
  number_prefix: string;
  total_cents: number;
  amount_paid_cents: number;
  currency: Currency;
  due_date: string;
  public_token: string;
  reminder_count: number;
  last_reminder_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  business_name: string;
  business_email: string | null;
  country: Country;
  timezone: string;
  plan: Plan;
  logo_path: string | null;
  plan_branding: boolean;
  template: string | null;
  reminders_enabled: boolean;
  invoice_reminders_enabled: boolean;
  invoice_reminder_1_days: number;
  invoice_reminder_2_days: number;
  reminder_kind: "invoice_reminder_1" | "invoice_reminder_2";
  unsubscribed: boolean;
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
          | "quote_followup_enabled" | "quote_followup_days" | "invoice_reminders_enabled" | "invoice_reminder_1_days" | "invoice_reminder_2_days"
          | "invoice_reminder_1_template" | "invoice_reminder_2_template"
          | "plan" | "trial_ends_at" | "paddle_customer_id" | "paddle_subscription_id" | "onboarded_at"
          | "subscription_status" | "current_period_end" | "cancel_at_period_end" | "billing_interval" | "paddle_price_id" | "last_billing_event_at"
        >;
        Update: Partial<BusinessRow>;
        Relationships: [];
      };
      customers: {
        Row: CustomerRow;
        Insert: Insertable<
          CustomerRow,
          Common | "email" | "phone" | "address_line1" | "city" | "region" | "postcode" | "notes" | "archived"
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
          | "accepted_ip" | "accepted_user_agent" | "accepted_verified" | "declined_at" | "decline_reason"
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
          | "customer_id" | "quote_id" | "title" | "status" | "issue_date" | "due_date" | "notes"
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
      invoice_payments: {
        Row: InvoicePaymentRow;
        Insert: Insertable<InvoicePaymentRow, "id" | "created_at" | "note" | "idempotency_key">;
        Update: Partial<InvoicePaymentRow>;
        Relationships: [
          Rel<"invoice_payments", "invoice_id", "invoices">,
          Rel<"invoice_payments", "business_id", "businesses">,
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
      quote_accept_otps: {
        Row: AcceptOtpRow;
        Insert: Insertable<AcceptOtpRow, "id" | "attempts" | "used_at" | "created_at">;
        Update: Partial<AcceptOtpRow>;
        Relationships: [Rel<"quote_accept_otps", "quote_id", "quotes">];
      };
      reminder_log: {
        Row: ReminderLogRow;
        Insert: Insertable<ReminderLogRow, Common | "status" | "reason" | "provider_message_id" | "number">;
        Update: Partial<ReminderLogRow>;
        Relationships: [Rel<"reminder_log", "business_id", "businesses">];
      };
      unsubscribed_emails: {
        Row: UnsubscribedEmailRow;
        Insert: Insertable<UnsubscribedEmailRow, "created_at">;
        Update: Partial<UnsubscribedEmailRow>;
        Relationships: [Rel<"unsubscribed_emails", "business_id", "businesses">];
      };
      billing_events: {
        Row: BillingEventRow;
        Insert: Insertable<BillingEventRow, "id" | "business_id" | "payload_summary" | "processed_at" | "status" | "error" | "created_at">;
        Update: Partial<BillingEventRow>;
        Relationships: [Rel<"billing_events", "business_id", "businesses">];
      };
      billing_notices: {
        Row: BillingNoticeRow;
        Insert: Insertable<BillingNoticeRow, "created_at">;
        Update: Partial<BillingNoticeRow>;
        Relationships: [Rel<"billing_notices", "business_id", "businesses">];
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
      save_quote: {
        Args: { p_quote_id: string; p_fields: Json; p_items: Json };
        Returns: undefined;
      };
      save_invoice: {
        Args: { p_invoice_id: string; p_fields: Json; p_items: Json };
        Returns: undefined;
      };
      record_invoice_payment: {
        Args: {
          p_invoice_id: string;
          p_amount_cents: number;
          p_method: string;
          p_paid_on: string;
          p_note: string | null;
          p_idempotency_key: string | null;
        };
        Returns: Json;
      };
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string | null };
        Returns: undefined;
      };
      create_invoice_from_quote: {
        Args: { p_quote_id: string };
        Returns: Json;
      };
      get_public_invoice: {
        Args: { p_token: string };
        Returns: Json | null;
      };
      record_invoice_view: {
        Args: { p_token: string };
        Returns: boolean;
      };
      invoice_derived_status: {
        Args: { p_status: string; p_due_date: string; p_tz: string; p_total: number; p_paid: number };
        Returns: string;
      };
      increment_ai_drafts: {
        Args: { p_business_id: string; p_period: string; p_limit: number };
        Returns: number | null;
      };
      refund_ai_draft: {
        Args: { p_business_id: string; p_period: string };
        Returns: undefined;
      };
      rate_limit_hit: {
        Args: { p_ip: string; p_key: string; p_window_start: string };
        Returns: number;
      };
      get_public_quote: {
        Args: { p_token: string };
        Returns: Json | null;
      };
      record_quote_view: {
        Args: { p_token: string };
        Returns: boolean;
      };
      accept_quote: {
        Args: { p_token: string; p_name: string; p_ip: string; p_ua: string };
        Returns: string;
      };
      decline_quote: {
        Args: { p_token: string; p_reason: string };
        Returns: string;
      };
      reserve_quote_send: {
        Args: { p_business_id: string; p_period: string; p_limit: number };
        Returns: number | null;
      };
      refund_quote_send: {
        Args: { p_business_id: string; p_period: string };
        Returns: undefined;
      };
      get_accept_target: {
        Args: { p_token: string };
        Returns: Json | null;
      };
      issue_accept_otp: {
        Args: { p_token: string; p_code_hash: string };
        Returns: string;
      };
      accept_quote_verified: {
        Args: { p_token: string; p_name: string; p_code_hash: string; p_ip: string; p_ua: string };
        Returns: { result: string; attempts_left: number | null }[];
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
      effective_plan: {
        Args: { p_plan: string; p_trial_ends_at: string | null; p_status: string | null; p_period_end: string | null; p_now?: string };
        Returns: "free" | "trial" | "pro" | "business";
      };
      apply_billing_event: {
        Args: { p_event_id: string; p_event_type: string; p_business_id: string | null; p_fields: Json; p_occurred_at: string; p_summary?: Json };
        Returns: string;
      };
      record_billing_failure: {
        Args: { p_event_id: string; p_event_type: string; p_error: string };
        Returns: undefined;
      };
      list_trial_notices: {
        Args: { p_now: string; p_limit?: number };
        Returns: { business_id: string; kind: "trial_ending" | "trial_ended"; business_name: string; business_email: string; timezone: string; trial_ends_at: string }[];
      };
      claim_billing_notice: {
        Args: { p_business_id: string; p_kind: string };
        Returns: boolean;
      };
      release_billing_notice: {
        Args: { p_business_id: string; p_kind: string };
        Returns: undefined;
      };
      claim_reminder: {
        Args: { p_entity_type: string; p_entity_id: string; p_kind: string };
        Returns: string | null;
      };
      finalize_reminder: {
        Args: { p_claim_id: string; p_status: string; p_reason: string | null; p_message_id: string | null };
        Returns: boolean;
      };
      list_due_quote_followups: {
        Args: { p_now: string; p_limit?: number };
        Returns: DueQuoteRow[];
      };
      list_due_invoice_reminders: {
        Args: { p_now: string; p_limit?: number };
        Returns: DueInvoiceRow[];
      };
      is_unsubscribed: {
        Args: { p_business_id: string; p_email: string };
        Returns: boolean;
      };
      record_unsubscribe: {
        Args: { p_business_id: string; p_email: string };
        Returns: undefined;
      };
      expire_due_quotes: {
        Args: { p_limit?: number };
        Returns: number;
      };
      customer_summary: {
        Args: { p_business_id: string };
        Returns: {
          customer_id: string;
          quote_count: number;
          invoice_count: number;
          total_paid_cents: number;
          outstanding_cents: number;
          last_activity_at: string | null;
        }[];
      };
      global_search: {
        Args: { p_business_id: string; p_query: string; p_limit?: number };
        Returns: {
          kind: "customer" | "quote" | "invoice";
          id: string;
          title: string;
          subtitle: string | null;
          status: string | null;
          amount_cents: number | null;
          amount_paid_cents: number | null;
          due_date: string | null;
          valid_until: string | null;
          number: number | null;
          archived: boolean;
          rank: number;
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
