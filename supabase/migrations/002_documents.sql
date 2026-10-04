-- 002_documents.sql — quotes, invoices, items, photos, activity, usage, rate limits (+ RLS)
-- Run after 001_core.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------------
create table if not exists public.quotes (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  customer_id         uuid references public.customers (id) on delete set null,
  number              integer not null,
  title               text,
  status              text not null default 'draft'
                      check (status in ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired')),
  notes               text,
  terms               text,
  valid_until         date,
  deposit_enabled     boolean not null default false,
  deposit_bps         integer not null default 3000 check (deposit_bps between 0 and 10000),
  include_photos      boolean not null default false,
  subtotal_cents      integer not null default 0,
  tax_cents           integer not null default 0,
  total_cents         integer not null default 0,
  currency            text not null check (currency in ('USD', 'GBP', 'AUD')),
  tax_rate_bps        integer not null default 0 check (tax_rate_bps between 0 and 10000),
  -- Safety-net default (>= 32 hex chars). The app generates 24-byte base64url tokens (lib/tokens.ts).
  public_token        text not null unique
                      default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  voice_note_path     text,
  transcript          text,
  sent_at             timestamptz,
  viewed_at           timestamptz,
  accepted_at         timestamptz,
  accepted_name       text,
  accepted_ip         text,
  accepted_user_agent text,
  declined_at         timestamptz,
  decline_reason      text,
  followup_count      integer not null default 0,
  last_followup_at    timestamptz,
  scheduled_for       timestamptz,
  unique (business_id, number)
);

create index if not exists quotes_business_status_idx on public.quotes (business_id, status);
create index if not exists quotes_business_created_idx on public.quotes (business_id, created_at desc);
create index if not exists quotes_customer_idx on public.quotes (customer_id);
create index if not exists quotes_valid_until_idx on public.quotes (valid_until) where status in ('sent', 'viewed');

drop trigger if exists quotes_set_updated_at on public.quotes;
create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

alter table public.quotes enable row level security;

drop policy if exists quotes_owner on public.quotes;
create policy quotes_owner on public.quotes
  for all to authenticated
  using (business_id = (select public.auth_business_id()))
  with check (
    business_id = (select public.auth_business_id())
    and (
      customer_id is null
      or exists (
        select 1 from public.customers c
        where c.id = customer_id and c.business_id = (select public.auth_business_id())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- quote_items (protected through the parent quote)
-- ---------------------------------------------------------------------------
create table if not exists public.quote_items (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  quote_id        uuid not null references public.quotes (id) on delete cascade,
  position        integer not null default 0,
  description     text not null,
  type            text not null default 'labour' check (type in ('labour', 'material', 'fee')),
  qty             numeric(10, 2) not null default 1,
  unit_rate_cents integer not null default 0,
  amount_cents    integer not null default 0,
  price_item_id   uuid references public.price_items (id) on delete set null,
  needs_price     boolean not null default false
);

create index if not exists quote_items_quote_idx on public.quote_items (quote_id, position);

drop trigger if exists quote_items_set_updated_at on public.quote_items;
create trigger quote_items_set_updated_at
  before update on public.quote_items
  for each row execute function public.set_updated_at();

alter table public.quote_items enable row level security;

drop policy if exists quote_items_owner on public.quote_items;
create policy quote_items_owner on public.quote_items
  for all to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id and q.business_id = (select public.auth_business_id())
    )
  )
  with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id and q.business_id = (select public.auth_business_id())
    )
    and (
      price_item_id is null
      or exists (
        select 1 from public.price_items p
        where p.id = price_item_id and p.business_id = (select public.auth_business_id())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
-- "overdue" is derived: status in ('sent','viewed') and due_date < today.
create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  customer_id        uuid references public.customers (id) on delete set null,
  quote_id           uuid references public.quotes (id) on delete set null,
  number             integer not null,
  status             text not null default 'draft'
                     check (status in ('draft', 'sent', 'viewed', 'paid', 'void')),
  issue_date         date not null default current_date,
  due_date           date not null default current_date,
  notes              text,
  subtotal_cents     integer not null default 0,
  tax_cents          integer not null default 0,
  total_cents        integer not null default 0,
  amount_paid_cents  integer not null default 0 check (amount_paid_cents >= 0),
  currency           text not null check (currency in ('USD', 'GBP', 'AUD')),
  tax_rate_bps       integer not null default 0 check (tax_rate_bps between 0 and 10000),
  public_token       text not null unique
                     default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  sent_at            timestamptz,
  viewed_at          timestamptz,
  paid_at            timestamptz,
  payment_method     text check (payment_method is null or payment_method in ('cash', 'card', 'bank_transfer', 'other')),
  reminder_count     integer not null default 0,
  last_reminder_at   timestamptz,
  unique (business_id, number)
);

create index if not exists invoices_business_status_idx on public.invoices (business_id, status);
create index if not exists invoices_business_created_idx on public.invoices (business_id, created_at desc);
create index if not exists invoices_customer_idx on public.invoices (customer_id);
create index if not exists invoices_quote_idx on public.invoices (quote_id);
create index if not exists invoices_due_idx on public.invoices (due_date) where status in ('sent', 'viewed');

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;

drop policy if exists invoices_owner on public.invoices;
create policy invoices_owner on public.invoices
  for all to authenticated
  using (business_id = (select public.auth_business_id()))
  with check (
    business_id = (select public.auth_business_id())
    and (
      customer_id is null
      or exists (
        select 1 from public.customers c
        where c.id = customer_id and c.business_id = (select public.auth_business_id())
      )
    )
    and (
      quote_id is null
      or exists (
        select 1 from public.quotes q
        where q.id = quote_id and q.business_id = (select public.auth_business_id())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- invoice_items (protected through the parent invoice)
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_items (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  invoice_id      uuid not null references public.invoices (id) on delete cascade,
  position        integer not null default 0,
  description     text not null,
  type            text not null default 'labour' check (type in ('labour', 'material', 'fee')),
  qty             numeric(10, 2) not null default 1,
  unit_rate_cents integer not null default 0,
  amount_cents    integer not null default 0,
  price_item_id   uuid references public.price_items (id) on delete set null,
  needs_price     boolean not null default false
);

create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

drop trigger if exists invoice_items_set_updated_at on public.invoice_items;
create trigger invoice_items_set_updated_at
  before update on public.invoice_items
  for each row execute function public.set_updated_at();

alter table public.invoice_items enable row level security;

drop policy if exists invoice_items_owner on public.invoice_items;
create policy invoice_items_owner on public.invoice_items
  for all to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.business_id = (select public.auth_business_id())
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.business_id = (select public.auth_business_id())
    )
    and (
      price_item_id is null
      or exists (
        select 1 from public.price_items p
        where p.id = price_item_id and p.business_id = (select public.auth_business_id())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- job_photos
-- ---------------------------------------------------------------------------
create table if not exists public.job_photos (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  quote_id     uuid references public.quotes (id) on delete cascade,
  invoice_id   uuid references public.invoices (id) on delete cascade,
  storage_path text not null,
  kind         text not null default 'other' check (kind in ('before', 'after', 'other')),
  position     integer not null default 0
);

create index if not exists job_photos_business_idx on public.job_photos (business_id);
create index if not exists job_photos_quote_idx on public.job_photos (quote_id, position);
create index if not exists job_photos_invoice_idx on public.job_photos (invoice_id, position);

drop trigger if exists job_photos_set_updated_at on public.job_photos;
create trigger job_photos_set_updated_at
  before update on public.job_photos
  for each row execute function public.set_updated_at();

alter table public.job_photos enable row level security;

drop policy if exists job_photos_owner on public.job_photos;
create policy job_photos_owner on public.job_photos
  for all to authenticated
  using (business_id = (select public.auth_business_id()))
  with check (
    business_id = (select public.auth_business_id())
    and (
      quote_id is null
      or exists (
        select 1 from public.quotes q
        where q.id = quote_id and q.business_id = (select public.auth_business_id())
      )
    )
    and (
      invoice_id is null
      or exists (
        select 1 from public.invoices i
        where i.id = invoice_id and i.business_id = (select public.auth_business_id())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- activity (append-only audit trail: select + insert only)
-- ---------------------------------------------------------------------------
create table if not exists public.activity (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  entity_type text not null check (entity_type in ('quote', 'invoice', 'customer')),
  entity_id   uuid not null,
  event       text not null,
  meta        jsonb not null default '{}'::jsonb
);

create index if not exists activity_business_created_idx on public.activity (business_id, created_at desc);
create index if not exists activity_entity_idx on public.activity (entity_type, entity_id);

drop trigger if exists activity_set_updated_at on public.activity;
create trigger activity_set_updated_at
  before update on public.activity
  for each row execute function public.set_updated_at();

alter table public.activity enable row level security;

drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity
  for select to authenticated
  using (business_id = (select public.auth_business_id()));

drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity
  for insert to authenticated
  with check (business_id = (select public.auth_business_id()));

-- ---------------------------------------------------------------------------
-- usage_counters (owners can read; only the service role writes, so plan
-- limits cannot be reset from the browser)
-- ---------------------------------------------------------------------------
create table if not exists public.usage_counters (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  period      text not null check (period ~ '^\d{4}-\d{2}$'),
  quotes_sent integer not null default 0,
  ai_drafts   integer not null default 0,
  unique (business_id, period)
);

drop trigger if exists usage_counters_set_updated_at on public.usage_counters;
create trigger usage_counters_set_updated_at
  before update on public.usage_counters
  for each row execute function public.set_updated_at();

alter table public.usage_counters enable row level security;

drop policy if exists usage_counters_select on public.usage_counters;
create policy usage_counters_select on public.usage_counters
  for select to authenticated
  using (business_id = (select public.auth_business_id()));

-- ---------------------------------------------------------------------------
-- rate_limits (service role only: RLS on, NO policies)
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  ip           text not null,
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 1,
  unique (ip, key, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

drop trigger if exists rate_limits_set_updated_at on public.rate_limits;
create trigger rate_limits_set_updated_at
  before update on public.rate_limits
  for each row execute function public.set_updated_at();

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
