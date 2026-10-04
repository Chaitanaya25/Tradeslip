-- 003_functions.sql — document numbering + dashboard queries
-- Run after 002_documents.sql. Safe to re-run.
-- All three functions are SECURITY INVOKER, so RLS applies: a user can only
-- ever see or touch their own business.

-- ---------------------------------------------------------------------------
-- next_doc_number(business_id, kind): atomically allocate the next number.
-- One UPDATE ... RETURNING takes a row lock, so two callers can never get the
-- same number. (If the caller's later insert fails, that number is skipped:
-- gaps are possible, duplicates are not.)
-- ---------------------------------------------------------------------------
create or replace function public.next_doc_number(p_business_id uuid, p_kind text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allocated integer;
begin
  if p_kind = 'quote' then
    update public.businesses
       set next_quote_number = next_quote_number + 1
     where id = p_business_id
    returning next_quote_number - 1 into allocated;
  elsif p_kind = 'invoice' then
    update public.businesses
       set next_invoice_number = next_invoice_number + 1
     where id = p_business_id
    returning next_invoice_number - 1 into allocated;
  else
    raise exception 'Unknown document kind "%": use ''quote'' or ''invoice''.', p_kind
      using errcode = '22023';
  end if;

  if allocated is null then
    raise exception 'Business not found.' using errcode = '42501';
  end if;

  return allocated;
end;
$$;

-- ---------------------------------------------------------------------------
-- dashboard_stats(business_id): one row for the four stat cards.
--   owed      = unpaid remainder of sent/viewed invoices (includes overdue)
--   awaiting  = quotes that are sent or viewed
--   paid_*    = payments recorded in the month (business timezone)
--   overdue   = the part of "owed" that is past its due date
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
    select
      coalesce((select b.timezone from public.businesses b where b.id = p_business_id), 'UTC') as tz
  ),
  bounds as (
    select
      (now() at time zone tz)::date as today,
      date_trunc('month', now() at time zone tz) as this_month,
      date_trunc('month', now() at time zone tz) - interval '1 month' as last_month,
      tz
    from ctx
  ),
  unpaid as (
    select i.total_cents - i.amount_paid_cents as remaining, i.due_date
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
    coalesce((select sum(i.amount_paid_cents) from public.invoices i, bounds b
      where i.business_id = p_business_id and i.status <> 'void' and i.paid_at is not null
        and (i.paid_at at time zone b.tz) >= b.this_month
        and (i.paid_at at time zone b.tz) < b.this_month + interval '1 month'), 0)::bigint,
    coalesce((select sum(i.amount_paid_cents) from public.invoices i, bounds b
      where i.business_id = p_business_id and i.status <> 'void' and i.paid_at is not null
        and (i.paid_at at time zone b.tz) >= b.last_month
        and (i.paid_at at time zone b.tz) < b.this_month), 0)::bigint,
    (select count(*) from unpaid u, bounds b where u.due_date < b.today)::integer,
    coalesce((select sum(u.remaining) from unpaid u, bounds b where u.due_date < b.today), 0)::bigint;
$$;

-- ---------------------------------------------------------------------------
-- monthly_invoice_totals(business_id, months): chart data, oldest month first.
-- Months with no invoices are returned as zeros. Drafts and void are ignored.
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
    select
      date_trunc(
        'month',
        now() at time zone coalesce((select b.timezone from public.businesses b where b.id = p_business_id), 'UTC')
      )::date as this_month
  ),
  months as (
    select (c.this_month - (n * interval '1 month'))::date as month
    from ctx c, generate_series(0, greatest(p_months, 1) - 1) as n
  )
  select
    m.month,
    coalesce(sum(i.amount_paid_cents), 0)::bigint as paid_cents,
    coalesce(sum(greatest(i.total_cents - i.amount_paid_cents, 0)), 0)::bigint as outstanding_cents
  from months m
  left join public.invoices i
    on i.business_id = p_business_id
   and i.status not in ('draft', 'void')
   and date_trunc('month', i.issue_date)::date = m.month
  group by m.month
  order by m.month;
$$;

-- Only signed-in users (and the service role) may call these.
revoke all on function public.next_doc_number(uuid, text) from public, anon;
revoke all on function public.dashboard_stats(uuid) from public, anon;
revoke all on function public.monthly_invoice_totals(uuid, integer) from public, anon;
grant execute on function public.next_doc_number(uuid, text) to authenticated, service_role;
grant execute on function public.dashboard_stats(uuid) to authenticated, service_role;
grant execute on function public.monthly_invoice_totals(uuid, integer) to authenticated, service_role;
