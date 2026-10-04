-- 009_invoices.sql — invoices: payments, save/void/convert functions, public invoice link
-- Run after 008_accept_otp.sql. Safe to re-run.
--
-- * "overdue" and "partial" are never stored. invoice_derived_status() computes them from
--   the stored status, the due date, today in the business timezone and the amounts.
-- * Money recorded against an invoice lives in invoice_payments and is written ONLY by
--   record_invoice_payment(), which keeps invoices.amount_paid_cents / paid_at in step.
--   Triggers stop an owner changing those columns (or a sent invoice's totals and items)
--   straight through the API.
-- * Owner-facing functions are SECURITY INVOKER (row level security applies). Public-page
--   functions are SECURITY DEFINER with an empty search_path and executable ONLY by the
--   service role.

-- ---------------------------------------------------------------------------
-- Column + constraint changes
-- ---------------------------------------------------------------------------
alter table public.invoices add column if not exists title text;

alter table public.invoices drop constraint if exists invoices_payment_method_check;
alter table public.invoices
  add constraint invoices_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'card', 'bank_transfer', 'cheque', 'other'));

-- One live (non-void) invoice per quote. A voided invoice may be re-issued.
create unique index if not exists invoices_one_live_per_quote
  on public.invoices (quote_id)
  where quote_id is not null and status <> 'void';

-- ---------------------------------------------------------------------------
-- invoice_payments: select + (function-only) insert. No update, no delete.
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_payments (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  invoice_id       uuid not null references public.invoices (id) on delete cascade,
  business_id      uuid not null references public.businesses (id) on delete cascade,
  amount_cents     integer not null check (amount_cents > 0),
  method           text not null check (method in ('cash', 'card', 'bank_transfer', 'cheque', 'other')),
  paid_on          date not null,
  note             text,
  idempotency_key  text,
  unique (invoice_id, idempotency_key)
);

create index if not exists invoice_payments_invoice_idx on public.invoice_payments (invoice_id, paid_on);
create index if not exists invoice_payments_business_paid_idx on public.invoice_payments (business_id, paid_on);

alter table public.invoice_payments enable row level security;

drop policy if exists invoice_payments_select on public.invoice_payments;
create policy invoice_payments_select on public.invoice_payments
  for select to authenticated
  using (business_id = (select public.auth_business_id()));

-- Insert is only possible inside record_invoice_payment(), which sets app.invoice_fn for its transaction.
drop policy if exists invoice_payments_insert on public.invoice_payments;
create policy invoice_payments_insert on public.invoice_payments
  for insert to authenticated
  with check (
    business_id = (select public.auth_business_id())
    and coalesce(current_setting('app.invoice_fn', true), '') = 'on'
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.business_id = (select public.auth_business_id())
    )
  );

-- Invoices that already show money received (demo seed data) get one payment row, so the
-- payment-based dashboard figures agree with amount_paid_cents. Runs once per invoice.
insert into public.invoice_payments (invoice_id, business_id, amount_cents, method, paid_on, note, idempotency_key)
select i.id, i.business_id, i.amount_paid_cents, coalesce(i.payment_method, 'other'),
       coalesce(i.paid_at::date, i.issue_date), 'Recorded before payments were tracked', 'backfill'
  from public.invoices i
 where i.amount_paid_cents > 0
   and not exists (select 1 from public.invoice_payments p where p.invoice_id = i.id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Tamper guards
-- ---------------------------------------------------------------------------
create or replace function public.invoices_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Only direct calls from signed-in browsers are restricted; the SQL functions below set the flag.
  if current_user in ('authenticated', 'anon') and coalesce(current_setting('app.invoice_fn', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      if new.status <> 'draft' or new.amount_paid_cents <> 0 or new.paid_at is not null or new.payment_method is not null then
        raise exception 'New invoices must start as unpaid drafts.' using errcode = '55000';
      end if;
    elsif tg_op = 'DELETE' then
      if old.status <> 'draft' then
        raise exception 'Only draft invoices can be deleted.' using errcode = '55000';
      end if;
      return old;
    else
      if new.amount_paid_cents is distinct from old.amount_paid_cents
         or new.paid_at is distinct from old.paid_at
         or new.payment_method is distinct from old.payment_method then
        raise exception 'Payments can only be recorded with record_invoice_payment().' using errcode = '55000';
      end if;
      if new.status is distinct from old.status and new.status in ('paid', 'void') then
        raise exception 'Use record_invoice_payment() or void_invoice() to change this status.' using errcode = '55000';
      end if;
      if old.status <> 'draft' and (
           new.subtotal_cents is distinct from old.subtotal_cents
        or new.tax_cents is distinct from old.tax_cents
        or new.total_cents is distinct from old.total_cents
        or new.tax_rate_bps is distinct from old.tax_rate_bps
        or new.currency is distinct from old.currency) then
        raise exception 'A sent invoice can''t be changed.' using errcode = '55000';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_guard on public.invoices;
create trigger invoices_guard
  before insert or update or delete on public.invoices
  for each row execute function public.invoices_guard();

create or replace function public.invoice_items_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_invoice uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
begin
  if current_user in ('authenticated', 'anon') and coalesce(current_setting('app.invoice_fn', true), '') <> 'on' then
    select i.status into v_status from public.invoices i where i.id = v_invoice;
    if found and v_status <> 'draft' then
      raise exception 'The items of a sent invoice can''t be changed.' using errcode = '55000';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists invoice_items_guard on public.invoice_items;
create trigger invoice_items_guard
  before insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_guard();

-- ---------------------------------------------------------------------------
-- invoice_derived_status(): SQL twin of derivedStatus() in src/lib/invoice-calc.ts.
-- draft / paid / void as stored; money owed and past due -> overdue (beats partial);
-- some paid -> partial; else the stored sent / viewed.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_derived_status(
  p_status text, p_due_date date, p_tz text, p_total integer, p_paid integer
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status in ('draft', 'paid', 'void') then p_status
    when p_total - p_paid > 0 and p_due_date < (now() at time zone coalesce(p_tz, 'UTC'))::date then 'overdue'
    when p_total - p_paid > 0 and p_paid > 0 then 'partial'
    else p_status
  end;
$$;

-- ---------------------------------------------------------------------------
-- save_invoice: save a DRAFT invoice and its items in ONE transaction (like save_quote).
-- ---------------------------------------------------------------------------
create or replace function public.save_invoice(p_invoice_id uuid, p_fields jsonb, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_issue  date := nullif(p_fields->>'issue_date', '')::date;
  v_due    date := nullif(p_fields->>'due_date', '')::date;
begin
  select i.status into v_status
    from public.invoices i
   where i.id = p_invoice_id
     for update;

  if not found then
    raise exception 'Invoice not found.' using errcode = '42501';
  end if;
  if v_status <> 'draft' then
    raise exception 'Only draft invoices can be edited.' using errcode = '55000';
  end if;
  if v_issue is null or v_due is null or v_due < v_issue then
    raise exception 'The due date can''t be before the issue date.' using errcode = '22023';
  end if;

  perform set_config('app.invoice_fn', 'on', true);

  -- Only these columns can be written here. Status, number, token, payments are untouched.
  update public.invoices
     set customer_id    = nullif(p_fields->>'customer_id', '')::uuid,
         title          = p_fields->>'title',
         notes          = p_fields->>'notes',
         issue_date     = v_issue,
         due_date       = v_due,
         subtotal_cents = (p_fields->>'subtotal_cents')::integer,
         tax_cents      = (p_fields->>'tax_cents')::integer,
         total_cents    = (p_fields->>'total_cents')::integer,
         tax_rate_bps   = (p_fields->>'tax_rate_bps')::integer,
         currency       = p_fields->>'currency'
   where id = p_invoice_id;

  delete from public.invoice_items where invoice_id = p_invoice_id;

  insert into public.invoice_items
    (invoice_id, position, description, type, qty, unit_rate_cents, amount_cents, price_item_id, needs_price)
  select p_invoice_id,
         (e.item->>'position')::integer,
         e.item->>'description',
         e.item->>'type',
         (e.item->>'qty')::numeric,
         (e.item->>'unit_rate_cents')::integer,
         (e.item->>'amount_cents')::integer,
         nullif(e.item->>'price_item_id', '')::uuid,
         coalesce((e.item->>'needs_price')::boolean, false)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as e(item);

  perform set_config('app.invoice_fn', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- record_invoice_payment: atomic, idempotent, never over-pays.
-- Errors: 42501 not found, 55000 wrong state, 22023 invalid input, 22003 over-payment.
-- ---------------------------------------------------------------------------
create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount_cents integer,
  p_method text,
  p_paid_on date,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inv        record;
  v_tz       text;
  v_today    date;
  v_existing record;
  v_paid     integer;
  v_status   text;
  v_pid      uuid;
  v_note     text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.' using errcode = '42501';
  end if;

  -- Same key again (double click, retry): report the original payment, change nothing.
  if p_idempotency_key is not null then
    select * into v_existing from public.invoice_payments
     where invoice_id = inv.id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'payment_id', v_existing.id,
        'amount_paid_cents', inv.amount_paid_cents,
        'remaining_cents', greatest(inv.total_cents - inv.amount_paid_cents, 0),
        'status', inv.status,
        'fully_paid', inv.status = 'paid',
        'duplicate', true);
    end if;
  end if;

  if inv.status in ('draft', 'void') then
    raise exception 'Send the invoice before recording a payment.' using errcode = '55000';
  end if;
  if inv.status = 'paid' or inv.amount_paid_cents >= inv.total_cents then
    raise exception 'This invoice is already paid.' using errcode = '55000';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount above zero.' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('cash', 'card', 'bank_transfer', 'cheque', 'other') then
    raise exception 'Choose how it was paid.' using errcode = '22023';
  end if;

  select timezone into v_tz from public.businesses where id = inv.business_id;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  if p_paid_on is null or p_paid_on > v_today + 1 then
    raise exception 'The payment date can''t be in the future.' using errcode = '22023';
  end if;

  if p_amount_cents > inv.total_cents - inv.amount_paid_cents then
    raise exception 'That is more than the balance still owed.' using errcode = '22003';
  end if;

  perform set_config('app.invoice_fn', 'on', true);

  insert into public.invoice_payments (invoice_id, business_id, amount_cents, method, paid_on, note, idempotency_key)
  values (inv.id, inv.business_id, p_amount_cents, p_method, p_paid_on, v_note, p_idempotency_key)
  returning id into v_pid;

  v_paid := inv.amount_paid_cents + p_amount_cents;
  v_status := inv.status;

  if v_paid >= inv.total_cents then
    update public.invoices
       set amount_paid_cents = v_paid, status = 'paid', paid_at = now(), payment_method = p_method
     where id = inv.id;
    v_status := 'paid';
  else
    update public.invoices set amount_paid_cents = v_paid where id = inv.id;
  end if;

  insert into public.activity (business_id, entity_type, entity_id, event, meta)
  values (inv.business_id, 'invoice', inv.id, 'invoice.payment_recorded',
          jsonb_build_object('amount_cents', p_amount_cents, 'method', p_method));
  if v_status = 'paid' then
    insert into public.activity (business_id, entity_type, entity_id, event, meta)
    values (inv.business_id, 'invoice', inv.id, 'invoice.paid', '{}'::jsonb);
  end if;

  perform set_config('app.invoice_fn', 'off', true);

  return jsonb_build_object(
    'payment_id', v_pid,
    'amount_paid_cents', v_paid,
    'remaining_cents', greatest(inv.total_cents - v_paid, 0),
    'status', v_status,
    'fully_paid', v_status = 'paid',
    'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- void_invoice: draft / sent / viewed with no payments only.
-- ---------------------------------------------------------------------------
create or replace function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inv      record;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.' using errcode = '42501';
  end if;
  if inv.status not in ('draft', 'sent', 'viewed') then
    raise exception 'This invoice can''t be voided.' using errcode = '55000';
  end if;
  if inv.amount_paid_cents > 0 or exists (select 1 from public.invoice_payments p where p.invoice_id = inv.id) then
    raise exception 'An invoice with payments recorded can''t be voided.' using errcode = '55000';
  end if;

  perform set_config('app.invoice_fn', 'on', true);
  update public.invoices set status = 'void' where id = inv.id;
  insert into public.activity (business_id, entity_type, entity_id, event, meta)
  values (inv.business_id, 'invoice', inv.id, 'invoice.voided',
          case when v_reason is null then '{}'::jsonb else jsonb_build_object('reason', v_reason) end);
  perform set_config('app.invoice_fn', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- create_invoice_from_quote: one invoice per accepted quote.
-- Returns {invoice_id, already_existed}. Errors: 42501 not found (or not yours), 55000 not accepted.
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice_from_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q        record;
  b        record;
  v_id     uuid;
  v_number integer;
  v_today  date;
  v_symbol text;
  v_dep    numeric;
  v_line   text;
begin
  -- RLS limits this to the caller's own business. The row lock serialises two taps.
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Quote not found.' using errcode = '42501';
  end if;
  if q.status <> 'accepted' then
    raise exception 'Only accepted quotes can be invoiced.' using errcode = '55000';
  end if;

  select i.id into v_id from public.invoices i where i.quote_id = q.id and i.status <> 'void' limit 1;
  if found then
    return jsonb_build_object('invoice_id', v_id, 'already_existed', true);
  end if;

  select * into b from public.businesses where id = q.business_id;
  v_today := (now() at time zone coalesce(b.timezone, 'UTC'))::date;
  v_number := public.next_doc_number(q.business_id, 'invoice');

  -- The deposit is noted, never assumed paid.
  if q.deposit_enabled then
    v_symbol := case q.currency when 'GBP' then '£' else '$' end;
    v_dep := round(q.total_cents::numeric * q.deposit_bps / 10000);
    v_line := 'Deposit of ' || v_symbol || to_char(v_dep / 100, 'FM999,999,990.00') || ' requested on acceptance.';
  end if;

  insert into public.invoices
    (business_id, customer_id, quote_id, number, status, title, notes, issue_date, due_date,
     subtotal_cents, tax_cents, total_cents, tax_rate_bps, currency)
  values
    (q.business_id, q.customer_id, q.id, v_number, 'draft', q.title,
     nullif(concat_ws(E'\n\n', nullif(btrim(coalesce(q.notes, '')), ''), v_line), ''),
     v_today, v_today + b.payment_terms_days,
     q.subtotal_cents, q.tax_cents, q.total_cents, q.tax_rate_bps, q.currency)
  returning id into v_id;

  insert into public.invoice_items
    (invoice_id, position, description, type, qty, unit_rate_cents, amount_cents, price_item_id, needs_price)
  select v_id, qi.position, qi.description, qi.type, qi.qty, qi.unit_rate_cents, qi.amount_cents, qi.price_item_id, false
    from public.quote_items qi
   where qi.quote_id = q.id
   order by qi.position;

  insert into public.activity (business_id, entity_type, entity_id, event, meta)
  values (q.business_id, 'invoice', v_id, 'invoice.created', jsonb_build_object('from_quote', q.number));

  return jsonb_build_object('invoice_id', v_id, 'already_existed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_public_invoice(token): the customer's view, as JSON. Whitelisted fields only.
-- Unknown / malformed tokens and drafts return NULL. A void invoice returns a minimal
-- object (status + number + how to contact the business) so the page can say so, with no
-- amounts, items or customer details. Never ids, the token, the plan name or other customers.
-- ---------------------------------------------------------------------------
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
        'plan_branding', b.plan in ('trial', 'free')));
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
      'plan_branding', b.plan in ('trial', 'free')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_invoice_view(token): true only for the first view of a sent invoice.
-- ---------------------------------------------------------------------------
create or replace function public.record_invoice_view(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  uuid;
  v_biz uuid;
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;

  update public.invoices
     set status = 'viewed', viewed_at = now()
   where public_token = p_token
     and status = 'sent'
     and viewed_at is null
  returning id, business_id into v_id, v_biz;

  if v_id is null then
    return false;
  end if;

  insert into public.activity (business_id, entity_type, entity_id, event, meta)
  values (v_biz, 'invoice', v_id, 'invoice.viewed', '{}'::jsonb);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- dashboard_stats: same columns as 003. Owed / overdue use the derived status; paid this
-- month / last month now sum the PAYMENTS dated in the month (business timezone), so a
-- partial payment counts in the month it was made. Void invoices are excluded.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_stats(p_business_id uuid)
returns table (
  owed_cents bigint,
  owed_count integer,
  awaiting_count integer,
  awaiting_value_cents bigint,
  paid_this_month_cents bigint,
  paid_last_month_cents bigint,
  overdue_count integer,
  overdue_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ctx as (
    select coalesce((select b.timezone from public.businesses b where b.id = p_business_id), 'UTC') as tz
  ),
  bounds as (
    select
      (date_trunc('month', now() at time zone tz))::date as this_month,
      (date_trunc('month', now() at time zone tz) - interval '1 month')::date as last_month,
      tz
    from ctx
  ),
  unpaid as (
    select
      i.total_cents - i.amount_paid_cents as remaining,
      public.invoice_derived_status(i.status, i.due_date, (select tz from ctx), i.total_cents, i.amount_paid_cents) as derived
    from public.invoices i
    where i.business_id = p_business_id
      and i.status in ('sent', 'viewed')
      and i.total_cents - i.amount_paid_cents > 0
  )
  select
    coalesce((select sum(remaining) from unpaid), 0)::bigint,
    (select count(*) from unpaid)::integer,
    (select count(*) from public.quotes q
      where q.business_id = p_business_id and q.status in ('sent', 'viewed'))::integer,
    coalesce((select sum(q.total_cents) from public.quotes q
      where q.business_id = p_business_id and q.status in ('sent', 'viewed')), 0)::bigint,
    coalesce((select sum(p.amount_cents)
      from public.invoice_payments p
      join public.invoices i on i.id = p.invoice_id, bounds b
      where p.business_id = p_business_id and i.status <> 'void'
        and p.paid_on >= b.this_month and p.paid_on < (b.this_month + interval '1 month')::date), 0)::bigint,
    coalesce((select sum(p.amount_cents)
      from public.invoice_payments p
      join public.invoices i on i.id = p.invoice_id, bounds b
      where p.business_id = p_business_id and i.status <> 'void'
        and p.paid_on >= b.last_month and p.paid_on < b.this_month), 0)::bigint,
    (select count(*) from unpaid where derived = 'overdue')::integer,
    coalesce((select sum(remaining) from unpaid where derived = 'overdue'), 0)::bigint;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke all on function public.invoice_derived_status(text, date, text, integer, integer) from public, anon;
revoke all on function public.save_invoice(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.record_invoice_payment(uuid, integer, text, date, text, text) from public, anon;
revoke all on function public.void_invoice(uuid, text) from public, anon;
revoke all on function public.create_invoice_from_quote(uuid) from public, anon;
grant execute on function public.invoice_derived_status(text, date, text, integer, integer) to authenticated, service_role;
grant execute on function public.save_invoice(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.record_invoice_payment(uuid, integer, text, date, text, text) to authenticated, service_role;
grant execute on function public.void_invoice(uuid, text) to authenticated, service_role;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated, service_role;

-- Service role only: the public invoice page.
revoke all on function public.get_public_invoice(text) from public, anon, authenticated;
revoke all on function public.record_invoice_view(text) from public, anon, authenticated;
grant execute on function public.get_public_invoice(text) to service_role;
grant execute on function public.record_invoice_view(text) to service_role;

revoke all on function public.dashboard_stats(uuid) from public, anon;
grant execute on function public.dashboard_stats(uuid) to authenticated, service_role;
