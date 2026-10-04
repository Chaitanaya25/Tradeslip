-- 012_billing.sql — plans, subscriptions and trial notices (Paddle)
-- Run after 011_reminders.sql. Safe to re-run.
--
-- The Paddle webhook is the ONLY writer of plan and subscription state: it calls apply_billing_event()
-- with the service-role client from server code. Owners cannot change any of these columns, even for their own
-- business (the guard trigger below). Every place that used the raw `plan` column now asks effective_plan(),
-- the SQL twin of effectivePlan() in src/lib/plans.ts (both are tested against src/lib/plans.fixtures.json).
--
-- The usage counters (reserve_quote_send, increment_ai_drafts) take their limit as a parameter that the
-- application computes from effectivePlan(), so they need no change.

-- ---------------------------------------------------------------------------
-- Subscription columns on businesses
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists subscription_status    text not null default 'none',
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at_period_end   boolean not null default false,
  add column if not exists billing_interval       text,
  add column if not exists paddle_price_id        text,
  add column if not exists last_billing_event_at  timestamptz;

alter table public.businesses drop constraint if exists businesses_subscription_status_check;
alter table public.businesses
  add constraint businesses_subscription_status_check
  check (subscription_status in ('none', 'trialing', 'active', 'past_due', 'paused', 'canceled'));

alter table public.businesses drop constraint if exists businesses_billing_interval_check;
alter table public.businesses
  add constraint businesses_billing_interval_check
  check (billing_interval is null or billing_interval in ('month', 'year'));

-- ---------------------------------------------------------------------------
-- Business-level activity (billing.checkout_started): the activity table also accepts entity_type 'business'.
-- ---------------------------------------------------------------------------
alter table public.activity drop constraint if exists activity_entity_type_check;
alter table public.activity
  add constraint activity_entity_type_check
  check (entity_type in ('quote', 'invoice', 'customer', 'business'));

-- ---------------------------------------------------------------------------
-- Billing guard: signed-in users (owners) can NEVER write plan, trial or any subscription column.
-- Only the service role (and a direct SQL-editor session) can.
-- ---------------------------------------------------------------------------
create or replace function public.guard_business_billing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No JWT claim means a direct DB connection (SQL editor / migrations): allow.
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.plan := 'trial';
    new.trial_ends_at := now() + interval '14 days';
    new.paddle_customer_id := null;
    new.paddle_subscription_id := null;
    new.subscription_status := 'none';
    new.current_period_end := null;
    new.cancel_at_period_end := false;
    new.billing_interval := null;
    new.paddle_price_id := null;
    new.last_billing_event_at := null;
  else
    new.plan := old.plan;
    new.trial_ends_at := old.trial_ends_at;
    new.paddle_customer_id := old.paddle_customer_id;
    new.paddle_subscription_id := old.paddle_subscription_id;
    new.subscription_status := old.subscription_status;
    new.current_period_end := old.current_period_end;
    new.cancel_at_period_end := old.cancel_at_period_end;
    new.billing_interval := old.billing_interval;
    new.paddle_price_id := old.paddle_price_id;
    new.last_billing_event_at := old.last_billing_event_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- effective_plan: the plan actually in force (twin of effectivePlan in src/lib/plans.ts).
--   pro / business apply while the subscription is active or trialing; past_due until the period end
--   + 7 days (grace); canceled until the period end. Paused or no subscription: not paid.
--   Otherwise a plan still on trial (stored trial, or a lapsed paid plan) with trial_ends_at in the
--   future is 'trial'. Everything else, including a stored 'free', is 'free'.
-- ---------------------------------------------------------------------------
create or replace function public.effective_plan(
  p_plan text,
  p_trial_ends_at timestamptz,
  p_status text,
  p_period_end timestamptz,
  p_now timestamptz default now()
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_plan in ('pro', 'business') and (
         coalesce(p_status, 'none') in ('active', 'trialing')
      or (p_status = 'past_due' and p_period_end is not null and p_now < p_period_end + interval '7 days')
      or (p_status = 'canceled' and p_period_end is not null and p_now < p_period_end)
    ) then p_plan
    when p_plan in ('trial', 'pro', 'business') and p_trial_ends_at is not null and p_now < p_trial_ends_at then 'trial'
    else 'free'
  end;
$$;

-- ---------------------------------------------------------------------------
-- billing_events: one row per Paddle event (idempotency key = paddle_event_id). RLS on, NO policies,
-- nothing granted to anon / authenticated. payload_summary holds ids only: no card or personal data.
-- ---------------------------------------------------------------------------
create table if not exists public.billing_events (
  id               uuid primary key default gen_random_uuid(),
  paddle_event_id  text not null unique,
  event_type       text not null,
  business_id      uuid references public.businesses (id) on delete set null,
  payload_summary  jsonb not null default '{}'::jsonb,
  processed_at     timestamptz,
  status           text not null default 'processed' check (status in ('processed', 'ignored', 'failed')),
  error            text,
  created_at       timestamptz not null default now()
);

create index if not exists billing_events_business_idx on public.billing_events (business_id, created_at desc);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- apply_billing_event: record one verified event and apply it atomically.
-- Outcomes: processed | already_processed | ignored_no_change | ignored_out_of_order |
--           ignored_unknown_business | ignored_customer_mismatch | ignored_subscription_mismatch.
-- A raised error rolls the event row back, so Paddle's retry can succeed.
-- ---------------------------------------------------------------------------
create or replace function public.apply_billing_event(
  p_event_id text,
  p_event_type text,
  p_business_id uuid,
  p_fields jsonb,
  p_occurred_at timestamptz,
  p_summary jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      uuid;
  v_status   text;
  b          record;
  v_fields   jsonb := coalesce(p_fields, '{}'::jsonb);
  v_customer text := nullif(v_fields->>'paddle_customer_id', '');
  v_sub      text := nullif(v_fields->>'paddle_subscription_id', '');
  v_outcome  text;
  v_new_status text := nullif(v_fields->>'subscription_status', '');
  v_new_plan   text := nullif(v_fields->>'plan', '');
  v_interval   text := nullif(v_fields->>'billing_interval', '');
begin
  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception 'Missing event id.' using errcode = '22023';
  end if;

  -- Give the record a shape (all columns null) so "b.id is null" works when nothing is found.
  select * into b from public.businesses where false;

  -- Idempotency: the first writer wins; a duplicate does nothing. A previously FAILED event may be retried.
  insert into public.billing_events (paddle_event_id, event_type, payload_summary, status)
  values (p_event_id, left(coalesce(p_event_type, ''), 100), coalesce(p_summary, '{}'::jsonb), 'ignored')
  on conflict (paddle_event_id) do nothing
  returning id into v_row;

  if v_row is null then
    select id, status into v_row, v_status from public.billing_events where paddle_event_id = p_event_id for update;
    if v_status <> 'failed' then
      return 'already_processed';
    end if;
    update public.billing_events set status = 'ignored', error = null where id = v_row;
  end if;

  if v_fields = '{}'::jsonb then
    v_outcome := 'ignored_no_change';
  else
    -- Resolve the business: the id from our own checkout (custom_data) if it exists, else by the Paddle customer id.
    if p_business_id is not null then
      select * into b from public.businesses where id = p_business_id for update;
    end if;
    if b.id is null and v_customer is not null then
      select * into b from public.businesses where paddle_customer_id = v_customer limit 1 for update;
    end if;

    if b.id is null then
      v_outcome := 'ignored_unknown_business';
    elsif b.paddle_customer_id is null or v_customer is null or b.paddle_customer_id <> v_customer then
      -- Only a customer our own server created (and stored) for this business may change its plan.
      v_outcome := 'ignored_customer_mismatch';
    elsif v_sub is not null and b.paddle_subscription_id is not null and b.paddle_subscription_id <> v_sub
          and b.subscription_status in ('active', 'trialing', 'past_due') then
      v_outcome := 'ignored_subscription_mismatch';
    elsif b.last_billing_event_at is not null and p_occurred_at < b.last_billing_event_at then
      v_outcome := 'ignored_out_of_order';
    elsif (v_new_status is not null and v_new_status not in ('none', 'trialing', 'active', 'past_due', 'paused', 'canceled'))
       or (v_new_plan is not null and v_new_plan not in ('pro', 'business'))
       or (v_interval is not null and v_interval not in ('month', 'year')) then
      raise exception 'Invalid billing fields.' using errcode = '22023';
    else
      update public.businesses set
        plan                   = coalesce(v_new_plan, plan),
        subscription_status    = coalesce(v_new_status, subscription_status),
        current_period_end     = case when v_fields ? 'current_period_end' then nullif(v_fields->>'current_period_end', '')::timestamptz else current_period_end end,
        cancel_at_period_end   = case when v_fields ? 'cancel_at_period_end' then (v_fields->>'cancel_at_period_end')::boolean else cancel_at_period_end end,
        billing_interval       = case when v_fields ? 'billing_interval' then v_interval else billing_interval end,
        paddle_price_id        = coalesce(nullif(v_fields->>'paddle_price_id', ''), paddle_price_id),
        paddle_subscription_id = coalesce(v_sub, paddle_subscription_id),
        last_billing_event_at  = greatest(coalesce(last_billing_event_at, p_occurred_at), p_occurred_at)
      where id = b.id;
      v_outcome := 'processed';
    end if;
  end if;

  update public.billing_events
     set business_id = b.id,
         status = case when v_outcome = 'processed' then 'processed' else 'ignored' end,
         processed_at = now(),
         error = case when v_outcome = 'processed' then null else v_outcome end
   where id = v_row;

  return v_outcome;
end;
$$;

-- Permanent failures (an event we cannot apply), recorded best effort. A later retry of the same id may still succeed.
create or replace function public.record_billing_failure(p_event_id text, p_event_type text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.billing_events (paddle_event_id, event_type, status, error, processed_at)
  values (p_event_id, left(coalesce(p_event_type, ''), 100), 'failed', left(coalesce(p_error, ''), 300), now())
  on conflict (paddle_event_id) do update
     set status = 'failed', error = excluded.error, processed_at = now()
   where public.billing_events.status = 'failed';
$$;

-- ---------------------------------------------------------------------------
-- Trial notices: "your trial ends in 3 days" and "your trial has ended", each at most once per business.
-- ---------------------------------------------------------------------------
create table if not exists public.billing_notices (
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind        text not null check (kind in ('trial_ending', 'trial_ended')),
  created_at  timestamptz not null default now(),
  primary key (business_id, kind)
);

alter table public.billing_notices enable row level security;
revoke all on public.billing_notices from anon, authenticated;

-- Businesses with no subscription whose trial ends within 3 days, or ended within the last 7 days (so a
-- fresh deploy does not email old accounts), and that have an email address and no notice of that kind yet.
create or replace function public.list_trial_notices(p_now timestamptz, p_limit integer default 200)
returns table (
  business_id uuid,
  kind text,
  business_name text,
  business_email text,
  timezone text,
  trial_ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         case when b.trial_ends_at > p_now then 'trial_ending' else 'trial_ended' end,
         b.name, btrim(b.email), b.timezone, b.trial_ends_at
    from public.businesses b
   where b.plan = 'trial'
     and b.subscription_status = 'none'
     and b.onboarded_at is not null
     and b.trial_ends_at is not null
     and nullif(btrim(coalesce(b.email, '')), '') is not null
     and (
          (b.trial_ends_at > p_now and b.trial_ends_at <= p_now + interval '3 days')
       or (b.trial_ends_at <= p_now and b.trial_ends_at > p_now - interval '7 days')
     )
     and not exists (
       select 1 from public.billing_notices n
        where n.business_id = b.id
          and n.kind = (case when b.trial_ends_at > p_now then 'trial_ending' else 'trial_ended' end))
   order by b.trial_ends_at
   limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

-- Take the right to send one notice. True for the first caller only.
create or replace function public.claim_billing_notice(p_business_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_kind not in ('trial_ending', 'trial_ended') then
    return false;
  end if;
  insert into public.billing_notices (business_id, kind) values (p_business_id, p_kind) on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

-- Give the claim back when the email failed, so the next run tries again.
create or replace function public.release_billing_notice(p_business_id uuid, p_kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.billing_notices where business_id = p_business_id and kind = p_kind;
$$;

-- ---------------------------------------------------------------------------
-- Functions that used the raw plan column now use effective_plan().
-- (Bodies are the same as in 008 / 009 / 011 except for the plan expression.)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_quote(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q        record;
  b        record;
  c        record;
  v_today  date;
  v_status text;
  v_items  jsonb;
  v_photos jsonb := '[]'::jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select * into q from public.quotes where public_token = p_token;
  if not found or q.status = 'draft' then
    return null;
  end if;

  select * into b from public.businesses where id = q.business_id;
  select * into c from public.customers where id = q.customer_id;

  v_today := (now() at time zone b.timezone)::date;
  v_status := case
    when q.status in ('sent', 'viewed') and q.valid_until is not null and q.valid_until < v_today then 'expired'
    else q.status
  end;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'description', i.description,
               'qty', i.qty,
               'unit_rate_cents', i.unit_rate_cents,
               'amount_cents', i.amount_cents,
               'position', i.position
             ) order by i.position
           ),
           '[]'::jsonb)
    into v_items
    from public.quote_items i
   where i.quote_id = q.id;

  if q.include_photos then
    select coalesce(
             jsonb_agg(jsonb_build_object('path', p.storage_path, 'kind', p.kind) order by p.position),
             '[]'::jsonb)
      into v_photos
      from public.job_photos p
     where p.quote_id = q.id;
  end if;

  return jsonb_build_object(
    'quote', jsonb_build_object(
      'number', q.number,
      'number_prefix', b.quote_prefix,
      'status', v_status,
      'title', q.title,
      'notes', q.notes,
      'terms', q.terms,
      'valid_until', q.valid_until,
      'deposit_enabled', q.deposit_enabled,
      'deposit_bps', q.deposit_bps,
      'include_photos', q.include_photos,
      'subtotal_cents', q.subtotal_cents,
      'tax_cents', q.tax_cents,
      'total_cents', q.total_cents,
      'currency', q.currency,
      'tax_rate_bps', q.tax_rate_bps,
      'accepted_at', q.accepted_at,
      'accepted_name', q.accepted_name,
      'accepted_verified', q.accepted_verified,
      'declined_at', q.declined_at,
      'decline_reason', q.decline_reason,
      -- true when the customer has an email on file, so accepting needs an emailed code
      'requires_verification', coalesce(btrim(c.email), '') <> ''
    ),
    'items', v_items,
    'customer', jsonb_build_object(
      'name', c.name,
      'address_line1', c.address_line1,
      'city', c.city,
      'region', c.region,
      'postcode', c.postcode
    ),
    'business', jsonb_build_object(
      'name', b.name,
      'country', b.country,
      'timezone', b.timezone,
      'logo_path', b.logo_path,
      'phone', b.phone,
      'email', b.email,
      'trade', b.trade,
      'tax_number', b.tax_number,
      'tax_label', b.tax_label,
      'payment_link_url', b.payment_link_url,
      'plan_branding', public.effective_plan(b.plan, b.trial_ends_at, b.subscription_status, b.current_period_end) in ('trial', 'free')
    ),
    'photos', v_photos
  );
end;
$$;

create or replace function public.get_public_invoice(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i        record;
  b        record;
  c        record;
  v_today  date;
  v_status text;
  v_items  jsonb;
  v_remaining integer;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select * into i from public.invoices where public_token = p_token;
  if not found or i.status = 'draft' then
    return null;
  end if;

  select * into b from public.businesses where id = i.business_id;

  if i.status = 'void' then
    return jsonb_build_object(
      'invoice', jsonb_build_object('number', i.number, 'number_prefix', b.invoice_prefix, 'status', 'void'),
      'business', jsonb_build_object(
        'name', b.name, 'country', b.country, 'timezone', b.timezone,
        'logo_path', b.logo_path, 'phone', b.phone, 'email', b.email,
        'plan_branding', public.effective_plan(b.plan, b.trial_ends_at, b.subscription_status, b.current_period_end) in ('trial', 'free')));
  end if;

  select * into c from public.customers where id = i.customer_id;

  v_today := (now() at time zone b.timezone)::date;
  v_remaining := greatest(i.total_cents - i.amount_paid_cents, 0);
  v_status := public.invoice_derived_status(i.status, i.due_date, b.timezone, i.total_cents, i.amount_paid_cents);

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'description', it.description,
               'qty', it.qty,
               'unit_rate_cents', it.unit_rate_cents,
               'amount_cents', it.amount_cents,
               'position', it.position
             ) order by it.position),
           '[]'::jsonb)
    into v_items
    from public.invoice_items it
   where it.invoice_id = i.id;

  return jsonb_build_object(
    'invoice', jsonb_build_object(
      'number', i.number,
      'number_prefix', b.invoice_prefix,
      'status', v_status,
      'title', i.title,
      'notes', i.notes,
      'issue_date', i.issue_date,
      'due_date', i.due_date,
      'subtotal_cents', i.subtotal_cents,
      'tax_cents', i.tax_cents,
      'total_cents', i.total_cents,
      'amount_paid_cents', i.amount_paid_cents,
      'remaining_cents', v_remaining,
      'days_overdue', case when v_status = 'overdue' then greatest(v_today - i.due_date, 0) else 0 end,
      'currency', i.currency,
      'tax_rate_bps', i.tax_rate_bps,
      'paid_at', i.paid_at
    ),
    'items', v_items,
    'customer', jsonb_build_object(
      'name', c.name,
      'address_line1', c.address_line1,
      'city', c.city,
      'region', c.region,
      'postcode', c.postcode
    ),
    'business', jsonb_build_object(
      'name', b.name,
      'country', b.country,
      'timezone', b.timezone,
      'logo_path', b.logo_path,
      'phone', b.phone,
      'email', b.email,
      'tax_number', b.tax_number,
      'tax_label', b.tax_label,
      'payment_link_url', b.payment_link_url,
      -- Whether to show the "Sent with Tradeslip" footer. The plan itself is never exposed.
      'plan_branding', public.effective_plan(b.plan, b.trial_ends_at, b.subscription_status, b.current_period_end) in ('trial', 'free')
    )
  );
end;
$$;

create or replace function public.list_due_quote_followups(p_now timestamptz, p_limit integer default 200)
returns table (
  entity_id uuid,
  business_id uuid,
  number integer,
  number_prefix text,
  total_cents integer,
  currency text,
  valid_until date,
  sent_at timestamptz,
  public_token text,
  followup_count integer,
  last_followup_at timestamptz,
  customer_name text,
  customer_email text,
  business_name text,
  business_email text,
  country text,
  timezone text,
  plan text,
  logo_path text,
  plan_branding boolean,
  template text,
  reminders_enabled boolean,
  quote_followup_enabled boolean,
  quote_followup_days integer,
  unsubscribed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.business_id, q.number, b.quote_prefix, q.total_cents, q.currency, q.valid_until, q.sent_at,
         q.public_token, q.followup_count, q.last_followup_at,
         c.name, btrim(c.email), b.name, b.email, b.country, b.timezone, public.effective_plan(b.plan, b.trial_ends_at, b.subscription_status, b.current_period_end, p_now), b.logo_path,
         (public.effective_plan(b.plan, b.trial_ends_at, b.subscription_status, b.current_period_end, p_now) in ('trial', 'free')), b.quote_followup_template,
         b.reminders_enabled, b.quote_followup_enabled, b.quote_followup_days, false
    from public.quotes q
    join public.businesses b on b.id = q.business_id
    join public.customers c on c.id = q.customer_id
   where q.status in ('sent', 'viewed')
     and q.followup_count = 0
     and b.reminders_enabled and b.quote_followup_enabled
     and public.effective_plan(b.plan, b.trial_ends_at, b.subscription_status, b.current_period_end, p_now) in ('trial', 'pro', 'business')
     and nullif(btrim(c.email), '') is not null
     and (q.valid_until is null or q.valid_until >= (p_now at time zone b.timezone)::date)
     and q.sent_at is not null
     and ((p_now at time zone b.timezone)::date - (q.sent_at at time zone b.timezone)::date) >= b.quote_followup_days
     and (q.last_followup_at is null or q.last_followup_at <= p_now - interval '24 hours')
     and not exists (
       select 1 from public.unsubscribed_emails u
        where u.business_id = q.business_id and u.email = lower(btrim(c.email)))
     and not exists (
       select 1 from public.reminder_log l
        where l.entity_type = 'quote' and l.entity_id = q.id and l.kind = 'quote_followup'
          and (l.status = 'sent'
               or (l.status = 'pending' and l.created_at > p_now - interval '15 minutes')
               or (l.status = 'failed' and l.created_at > p_now - interval '6 hours')
               or (l.status = 'skipped' and l.reason = 'invalid_address')))
   order by q.sent_at
   limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

create or replace function public.list_due_invoice_reminders(p_now timestamptz, p_limit integer default 200)
returns table (
  entity_id uuid,
  business_id uuid,
  number integer,
  number_prefix text,
  total_cents integer,
  amount_paid_cents integer,
  currency text,
  due_date date,
  public_token text,
  reminder_count integer,
  last_reminder_at timestamptz,
  customer_name text,
  customer_email text,
  business_name text,
  business_email text,
  country text,
  timezone text,
  plan text,
  logo_path text,
  plan_branding boolean,
  template text,
  reminders_enabled boolean,
  invoice_reminders_enabled boolean,
  invoice_reminder_1_days integer,
  invoice_reminder_2_days integer,
  reminder_kind text,
  unsubscribed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.business_id, i.number, b.invoice_prefix, i.total_cents, i.amount_paid_cents, i.currency, i.due_date,
         i.public_token, i.reminder_count, i.last_reminder_at,
         c.name, btrim(c.email), b.name, b.email, b.country, b.timezone, public.effective_plan(b.plan, b.trial_ends_at, b.subscription_status, b.current_period_end, p_now), b.logo_path,
         (public.effective_plan(b.plan, b.trial_ends_at, b.subscription_status, b.current_period_end, p_now) in ('trial', 'free')),
         case when i.reminder_count = 0 then b.invoice_reminder_1_template else b.invoice_reminder_2_template end,
         b.reminders_enabled, b.invoice_reminders_enabled, b.invoice_reminder_1_days, b.invoice_reminder_2_days,
         case when i.reminder_count = 0 then 'invoice_reminder_1' else 'invoice_reminder_2' end,
         false
    from public.invoices i
    join public.businesses b on b.id = i.business_id
    join public.customers c on c.id = i.customer_id
   where i.status in ('sent', 'viewed')
     and i.total_cents > i.amount_paid_cents
     and i.reminder_count < 2
     and i.due_date < (p_now at time zone b.timezone)::date
     and b.reminders_enabled and b.invoice_reminders_enabled
     and public.effective_plan(b.plan, b.trial_ends_at, b.subscription_status, b.current_period_end, p_now) in ('trial', 'pro', 'business')
     and nullif(btrim(c.email), '') is not null
     and (i.last_reminder_at is null or i.last_reminder_at <= p_now - interval '24 hours')
     and (
       (i.reminder_count = 0
         and (p_now at time zone b.timezone)::date >= i.due_date + b.invoice_reminder_1_days)
       or
       (i.reminder_count = 1
         and ((p_now at time zone b.timezone)::date >= i.due_date + b.invoice_reminder_2_days
              or (i.last_reminder_at is not null
                  and (p_now at time zone b.timezone)::date >= (i.last_reminder_at at time zone b.timezone)::date + 6)))
     )
     and not exists (
       select 1 from public.unsubscribed_emails u
        where u.business_id = i.business_id and u.email = lower(btrim(c.email)))
     and not exists (
       select 1 from public.reminder_log l
        where l.entity_type = 'invoice' and l.entity_id = i.id
          and l.kind = (case when i.reminder_count = 0 then 'invoice_reminder_1' else 'invoice_reminder_2' end)
          and (l.status = 'sent'
               or (l.status = 'pending' and l.created_at > p_now - interval '15 minutes')
               or (l.status = 'failed' and l.created_at > p_now - interval '6 hours')
               or (l.status = 'skipped' and l.reason = 'invalid_address')))
   order by i.due_date
   limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke all on function public.effective_plan(text, timestamptz, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.effective_plan(text, timestamptz, text, timestamptz, timestamptz) to authenticated, service_role;

revoke all on function public.apply_billing_event(text, text, uuid, jsonb, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.record_billing_failure(text, text, text) from public, anon, authenticated;
revoke all on function public.list_trial_notices(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.claim_billing_notice(uuid, text) from public, anon, authenticated;
revoke all on function public.release_billing_notice(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_billing_event(text, text, uuid, jsonb, timestamptz, jsonb) to service_role;
grant execute on function public.record_billing_failure(text, text, text) to service_role;
grant execute on function public.list_trial_notices(timestamptz, integer) to service_role;
grant execute on function public.claim_billing_notice(uuid, text) to service_role;
grant execute on function public.release_billing_notice(uuid, text) to service_role;

-- Re-state the service-role-only grants for the re-created functions.
revoke all on function public.get_public_quote(text) from public, anon, authenticated;
revoke all on function public.get_public_invoice(text) from public, anon, authenticated;
revoke all on function public.list_due_quote_followups(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.list_due_invoice_reminders(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.get_public_quote(text) to service_role;
grant execute on function public.get_public_invoice(text) to service_role;
grant execute on function public.list_due_quote_followups(timestamptz, integer) to service_role;
grant execute on function public.list_due_invoice_reminders(timestamptz, integer) to service_role;
