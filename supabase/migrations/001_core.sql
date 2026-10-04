-- 001_core.sql — extensions, helpers, businesses, customers, price_items (+ RLS)
-- Safe to re-run. Money is integer cents, tax is basis points (2000 = 20%).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  owner_id                uuid not null unique references auth.users (id) on delete cascade,
  name                    text not null,
  trade                   text,
  logo_path               text,
  phone                   text,
  email                   text,
  address_line1           text,
  city                    text,
  region                  text,
  postcode                text,
  country                 text not null check (country in ('US', 'UK', 'AU')),
  currency                text not null check (currency in ('USD', 'GBP', 'AUD')),
  timezone                text not null default 'UTC',
  tax_enabled             boolean not null default false,
  tax_label               text not null default 'Sales tax',
  tax_rate_bps            integer not null default 0 check (tax_rate_bps between 0 and 10000),
  tax_number              text,
  default_hourly_rate_cents integer not null default 0 check (default_hourly_rate_cents >= 0),
  callout_fee_cents       integer not null default 0 check (callout_fee_cents >= 0),
  payment_terms_days      integer not null default 14 check (payment_terms_days between 0 and 365),
  quote_validity_days     integer not null default 30 check (quote_validity_days between 1 and 365),
  payment_link_url        text,
  quote_prefix            text not null default '',
  invoice_prefix          text not null default 'INV-',
  next_quote_number       integer not null default 1001 check (next_quote_number >= 1),
  next_invoice_number     integer not null default 1001 check (next_invoice_number >= 1),
  reminders_enabled       boolean not null default true,
  quote_followup_template text,
  invoice_reminder_template text,
  plan                    text not null default 'trial' check (plan in ('trial', 'free', 'pro', 'business')),
  trial_ends_at           timestamptz,
  paddle_customer_id      text,
  paddle_subscription_id  text,
  onboarded_at            timestamptz
);

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- Billing columns may only be changed by the service role (webhooks, server code).
-- Without this an owner could set plan = 'business' straight from the browser.
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
  else
    new.plan := old.plan;
    new.trial_ends_at := old.trial_ends_at;
    new.paddle_customer_id := old.paddle_customer_id;
    new.paddle_subscription_id := old.paddle_subscription_id;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_guard_billing on public.businesses;
create trigger businesses_guard_billing
  before insert or update on public.businesses
  for each row execute function public.guard_business_billing();

-- ---------------------------------------------------------------------------
-- auth_business_id(): the business owned by the signed-in user
-- ---------------------------------------------------------------------------
create or replace function public.auth_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.businesses where owner_id = auth.uid()
$$;

revoke all on function public.auth_business_id() from public, anon;
grant execute on function public.auth_business_id() to authenticated, service_role;

alter table public.businesses enable row level security;

drop policy if exists businesses_owner on public.businesses;
create policy businesses_owner on public.businesses
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  name          text not null,
  email         text,
  phone         text,
  address_line1 text,
  city          text,
  region        text,
  postcode      text,
  notes         text
);

create index if not exists customers_business_name_idx on public.customers (business_id, name);

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

drop policy if exists customers_owner on public.customers;
create policy customers_owner on public.customers
  for all to authenticated
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));

-- ---------------------------------------------------------------------------
-- price_items
-- ---------------------------------------------------------------------------
create table if not exists public.price_items (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('labour', 'material', 'fee')),
  unit        text not null check (unit in ('job', 'hour', 'item', 'm2', 'm', 'day')),
  rate_cents  integer not null default 0 check (rate_cents >= 0),
  markup_bps  integer not null default 0 check (markup_bps >= 0),
  archived    boolean not null default false
);

create index if not exists price_items_business_idx
  on public.price_items (business_id, archived, name);

drop trigger if exists price_items_set_updated_at on public.price_items;
create trigger price_items_set_updated_at
  before update on public.price_items
  for each row execute function public.set_updated_at();

alter table public.price_items enable row level security;

drop policy if exists price_items_owner on public.price_items;
create policy price_items_owner on public.price_items
  for all to authenticated
  using (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
