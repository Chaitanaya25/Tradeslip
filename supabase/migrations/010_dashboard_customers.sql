-- 010_dashboard_customers.sql — dashboard chart fix, customer archive, customer summary, global search
-- Run after 009_invoices.sql. Safe to re-run.
--
-- All new functions are SECURITY INVOKER, so row level security applies: a signed-in user
-- can only ever see their own business, whatever business id they pass.

-- ---------------------------------------------------------------------------
-- Customers can be archived (hidden from lists and pickers, kept on documents).
-- ---------------------------------------------------------------------------
alter table public.customers add column if not exists archived boolean not null default false;

-- ---------------------------------------------------------------------------
-- Indexes for the dashboard, the lists and search.
-- ---------------------------------------------------------------------------
create index if not exists customers_business_archived_name_idx on public.customers (business_id, archived, name);
create index if not exists customers_business_lower_name_idx on public.customers (business_id, lower(name));
create index if not exists quotes_business_status_sent_idx on public.quotes (business_id, status, sent_at);
create index if not exists invoices_business_status_due_idx on public.invoices (business_id, status, due_date);

-- ---------------------------------------------------------------------------
-- monthly_invoice_totals: same "paid" definition as dashboard_stats (009).
--   paid_cents        = payments dated (paid_on) in the month, void invoices excluded
--   outstanding_cents = balance still owed on sent / viewed invoices issued in the month
-- Months with nothing are zero. Oldest month first. (003 summed amount_paid_cents by issue month.)
-- ---------------------------------------------------------------------------
create or replace function public.monthly_invoice_totals(p_business_id uuid, p_months integer default 6)
returns table (
  month date,
  paid_cents bigint,
  outstanding_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ctx as (
    select date_trunc(
             'month',
             now() at time zone coalesce((select b.timezone from public.businesses b where b.id = p_business_id), 'UTC')
           )::date as this_month
  ),
  months as (
    select (c.this_month - (n * interval '1 month'))::date as month
    from ctx c, generate_series(0, least(greatest(p_months, 1), 36) - 1) as n
  )
  select
    m.month,
    coalesce((
      select sum(p.amount_cents)
        from public.invoice_payments p
        join public.invoices i on i.id = p.invoice_id
       where p.business_id = p_business_id
         and i.status <> 'void'
         and date_trunc('month', p.paid_on)::date = m.month
    ), 0)::bigint as paid_cents,
    coalesce((
      select sum(greatest(i.total_cents - i.amount_paid_cents, 0))
        from public.invoices i
       where i.business_id = p_business_id
         and i.status in ('sent', 'viewed')
         and date_trunc('month', i.issue_date)::date = m.month
    ), 0)::bigint as outstanding_cents
  from months m
  order by m.month;
$$;

-- ---------------------------------------------------------------------------
-- customer_summary: one row per customer, so the list needs one query, not N.
--   outstanding = balance on sent / viewed invoices (includes overdue, same rule as the invoice pages)
--   total_paid  = money received on non-void invoices
-- ---------------------------------------------------------------------------
create or replace function public.customer_summary(p_business_id uuid)
returns table (
  customer_id uuid,
  quote_count integer,
  invoice_count integer,
  total_paid_cents bigint,
  outstanding_cents bigint,
  last_activity_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    (select count(*) from public.quotes q where q.customer_id = c.id and q.business_id = p_business_id)::integer,
    (select count(*) from public.invoices i where i.customer_id = c.id and i.business_id = p_business_id)::integer,
    coalesce((select sum(i.amount_paid_cents) from public.invoices i
               where i.customer_id = c.id and i.business_id = p_business_id and i.status <> 'void'), 0)::bigint,
    coalesce((select sum(greatest(i.total_cents - i.amount_paid_cents, 0)) from public.invoices i
               where i.customer_id = c.id and i.business_id = p_business_id and i.status in ('sent', 'viewed')), 0)::bigint,
    greatest(
      c.updated_at,
      (select max(q.updated_at) from public.quotes q where q.customer_id = c.id and q.business_id = p_business_id),
      (select max(i.updated_at) from public.invoices i where i.customer_id = c.id and i.business_id = p_business_id),
      (select max(p.created_at) from public.invoice_payments p
         join public.invoices i on i.id = p.invoice_id
        where i.customer_id = c.id and p.business_id = p_business_id)
    )
  from public.customers c
  where c.business_id = p_business_id;
$$;

-- ---------------------------------------------------------------------------
-- global_search: customers, quotes and invoices matching a query, capped per kind.
-- The query is trimmed, control characters dropped, split into up to 5 words; EVERY word has
-- to match somewhere (name, email, phone (also digits only), address, number, title).
-- % _ and \ are escaped, so "100%" matches literally. Under 2 characters returns nothing.
-- Status is returned raw; the app derives overdue / partial / expired in one place (TypeScript).
-- ---------------------------------------------------------------------------
create or replace function public.global_search(p_business_id uuid, p_query text, p_limit integer default 5)
returns table (
  kind text,
  id uuid,
  title text,
  subtitle text,
  status text,
  amount_cents integer,
  amount_paid_cents integer,
  due_date date,
  valid_until date,
  number integer,
  archived boolean,
  rank integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_q      text := left(btrim(regexp_replace(coalesce(p_query, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), 80);
  v_ql     text;
  v_tokens text[];
  v_pats   text[];
  v_limit  integer := least(greatest(coalesce(p_limit, 5), 1), 10);
  v_esc    text;
  v_num    text;
begin
  if char_length(v_q) < 2 then
    return;
  end if;

  v_ql := ltrim(lower(v_q), '#');
  v_num := regexp_replace(v_ql, '^[a-z]+[-_]?', '');
  select array_agg(left(ltrim(t, '#'), 40)) into v_tokens
    from (select t from regexp_split_to_table(lower(v_q), ' ') as t where ltrim(t, '#') <> '' limit 5) s;
  if v_tokens is null then
    return;
  end if;
  v_pats := array(select '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%' from unnest(v_tokens) as t);
  v_esc := replace(replace(replace(v_ql, '\', '\\'), '%', '\%'), '_', '\_');

  -- customers
  return query
  select 'customer'::text, c.id, c.name,
         nullif(concat_ws(' · ', nullif(concat_ws(', ', c.address_line1, c.city), ''), c.phone, c.email), ''),
         null::text, null::integer, null::integer, null::date, null::date, null::integer, c.archived,
         (case when lower(c.name) = v_ql then 100
               when lower(c.name) like v_esc || '%' then 80
               when lower(c.name) like '% ' || v_esc || '%' then 60
               else 30 end)
    from public.customers c
   where c.business_id = p_business_id
     and lower(concat_ws(' ', c.name, c.email, c.phone, regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'),
                         c.address_line1, c.city, c.region, c.postcode)) like all (v_pats)
   order by 12 desc, c.name
   limit v_limit;

  -- quotes
  return query
  select 'quote'::text, q.id, b.quote_prefix || q.number::text,
         nullif(concat_ws(' · ', c.name, q.title), ''),
         q.status, q.total_cents, 0, null::date, q.valid_until, q.number, false,
         (case when lower(c.name) = v_ql then 100
               when lower(c.name) like v_esc || '%' then 80
               when lower(c.name) like '% ' || v_esc || '%' then 60
               else 30 end)
         + (case when q.number::text = v_num or lower(b.quote_prefix || q.number::text) = v_ql then 20 else 0 end)
    from public.quotes q
    join public.businesses b on b.id = q.business_id
    left join public.customers c on c.id = q.customer_id
   where q.business_id = p_business_id
     and lower(concat_ws(' ', q.number::text, b.quote_prefix || q.number::text, q.title, c.name, c.email)) like all (v_pats)
   order by 12 desc, q.created_at desc
   limit v_limit;

  -- invoices
  return query
  select 'invoice'::text, i.id, b.invoice_prefix || i.number::text,
         nullif(concat_ws(' · ', c.name, i.title), ''),
         i.status, i.total_cents, i.amount_paid_cents, i.due_date, null::date, i.number, false,
         (case when lower(c.name) = v_ql then 100
               when lower(c.name) like v_esc || '%' then 80
               when lower(c.name) like '% ' || v_esc || '%' then 60
               else 30 end)
         + (case when i.number::text = v_num or lower(b.invoice_prefix || i.number::text) = v_ql then 20 else 0 end)
    from public.invoices i
    join public.businesses b on b.id = i.business_id
    left join public.customers c on c.id = i.customer_id
   where i.business_id = p_business_id
     and lower(concat_ws(' ', i.number::text, b.invoice_prefix || i.number::text, i.title, c.name, c.email)) like all (v_pats)
   order by 12 desc, i.created_at desc
   limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions: signed-in users (and the service role) only.
-- ---------------------------------------------------------------------------
revoke all on function public.monthly_invoice_totals(uuid, integer) from public, anon;
revoke all on function public.customer_summary(uuid) from public, anon;
revoke all on function public.global_search(uuid, text, integer) from public, anon;
grant execute on function public.monthly_invoice_totals(uuid, integer) to authenticated, service_role;
grant execute on function public.customer_summary(uuid) to authenticated, service_role;
grant execute on function public.global_search(uuid, text, integer) to authenticated, service_role;
