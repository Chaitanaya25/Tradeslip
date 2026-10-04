-- 011_reminders.sql — automatic reminders: settings, log, claims, due lists, unsubscribe, expiry
-- Run after 010_dashboard_customers.sql. Safe to re-run.
--
-- The cron route (/api/cron/reminders) is the only caller of the functions below: they are all
-- SECURITY DEFINER with an empty search_path and executable by the service role only.
-- Business owners can READ their reminder log and manage their unsubscribe list, never write to them.

-- ---------------------------------------------------------------------------
-- Settings on businesses. Owners edit these through the normal businesses policy; CHECKs bound them.
-- (Plan gating is enforced by the server action and by the list functions: a free plan never gets
-- reminders whatever these flags say.)
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists quote_followup_enabled     boolean not null default true,
  add column if not exists quote_followup_days        integer not null default 3,
  add column if not exists invoice_reminders_enabled  boolean not null default true,
  add column if not exists invoice_reminder_1_days    integer not null default 1,
  add column if not exists invoice_reminder_2_days    integer not null default 7,
  add column if not exists invoice_reminder_1_template text,
  add column if not exists invoice_reminder_2_template text;

alter table public.businesses drop constraint if exists businesses_quote_followup_days_check;
alter table public.businesses add constraint businesses_quote_followup_days_check check (quote_followup_days between 1 and 14);
alter table public.businesses drop constraint if exists businesses_invoice_reminder_1_days_check;
alter table public.businesses add constraint businesses_invoice_reminder_1_days_check check (invoice_reminder_1_days between 1 and 14);
alter table public.businesses drop constraint if exists businesses_invoice_reminder_2_days_check;
alter table public.businesses add constraint businesses_invoice_reminder_2_days_check check (invoice_reminder_2_days between 3 and 30);
alter table public.businesses drop constraint if exists businesses_reminder_order_check;
alter table public.businesses add constraint businesses_reminder_order_check check (invoice_reminder_2_days > invoice_reminder_1_days);
alter table public.businesses drop constraint if exists businesses_reminder_templates_length_check;
alter table public.businesses add constraint businesses_reminder_templates_length_check check (
  char_length(coalesce(quote_followup_template, '')) <= 1500
  and char_length(coalesce(invoice_reminder_1_template, '')) <= 1500
  and char_length(coalesce(invoice_reminder_2_template, '')) <= 1500
);

-- The earlier single invoice template becomes the first reminder's template (once).
update public.businesses
   set invoice_reminder_1_template = invoice_reminder_template
 where invoice_reminder_1_template is null
   and invoice_reminder_template is not null
   and char_length(invoice_reminder_template) <= 1500;

-- ---------------------------------------------------------------------------
-- reminder_log: one row per attempt. The partial unique index means a second claim or a second
-- "sent" for the same reminder is impossible, even with two cron runs at once.
-- ---------------------------------------------------------------------------
create table if not exists public.reminder_log (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  entity_type         text not null check (entity_type in ('quote', 'invoice')),
  entity_id           uuid not null,
  kind                text not null check (kind in ('quote_followup', 'invoice_reminder_1', 'invoice_reminder_2')),
  status              text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  reason              text,
  provider_message_id text,
  number              integer,
  check ((entity_type = 'quote' and kind = 'quote_followup') or (entity_type = 'invoice' and kind in ('invoice_reminder_1', 'invoice_reminder_2')))
);

create unique index if not exists reminder_log_one_active
  on public.reminder_log (entity_type, entity_id, kind)
  where status in ('pending', 'sent');
create index if not exists reminder_log_business_created_idx on public.reminder_log (business_id, created_at desc);
create index if not exists reminder_log_entity_idx on public.reminder_log (entity_type, entity_id, kind, created_at desc);

drop trigger if exists reminder_log_set_updated_at on public.reminder_log;
create trigger reminder_log_set_updated_at
  before update on public.reminder_log
  for each row execute function public.set_updated_at();

alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
grant select on public.reminder_log to authenticated;

drop policy if exists reminder_log_select on public.reminder_log;
create policy reminder_log_select on public.reminder_log
  for select to authenticated
  using (business_id = (select public.auth_business_id()));

-- ---------------------------------------------------------------------------
-- unsubscribed_emails: addresses that asked to stop reminders from a business (lower-cased).
-- Owners can see and remove entries; only the service role adds them (via a signed link).
-- ---------------------------------------------------------------------------
create table if not exists public.unsubscribed_emails (
  business_id uuid not null references public.businesses (id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) <= 254),
  created_at  timestamptz not null default now(),
  primary key (business_id, email)
);

alter table public.unsubscribed_emails enable row level security;
revoke all on public.unsubscribed_emails from anon, authenticated;
grant select, delete on public.unsubscribed_emails to authenticated;

drop policy if exists unsubscribed_select on public.unsubscribed_emails;
create policy unsubscribed_select on public.unsubscribed_emails
  for select to authenticated
  using (business_id = (select public.auth_business_id()));

drop policy if exists unsubscribed_delete on public.unsubscribed_emails;
create policy unsubscribed_delete on public.unsubscribed_emails
  for delete to authenticated
  using (business_id = (select public.auth_business_id()));

-- ---------------------------------------------------------------------------
-- claim_reminder: take the exclusive right to send one reminder. Returns the claim id, or NULL when
-- another run holds it or it was already sent. A pending claim older than 15 minutes is stale
-- (the run died): it is marked failed and can be claimed again.
-- ---------------------------------------------------------------------------
create or replace function public.claim_reminder(p_entity_type text, p_entity_id uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_biz    uuid;
  v_number integer;
  v_id     uuid;
begin
  if not ((p_entity_type = 'quote' and p_kind = 'quote_followup')
       or (p_entity_type = 'invoice' and p_kind in ('invoice_reminder_1', 'invoice_reminder_2'))) then
    return null;
  end if;

  if p_entity_type = 'quote' then
    select business_id, number into v_biz, v_number from public.quotes where id = p_entity_id;
  else
    select business_id, number into v_biz, v_number from public.invoices where id = p_entity_id;
  end if;
  if v_biz is null then
    return null;
  end if;

  update public.reminder_log
     set status = 'failed', reason = 'stale_claim'
   where entity_type = p_entity_type and entity_id = p_entity_id and kind = p_kind
     and status = 'pending' and created_at < now() - interval '15 minutes';

  insert into public.reminder_log (business_id, entity_type, entity_id, kind, status, number)
  values (v_biz, p_entity_type, p_entity_id, p_kind, 'pending', v_number)
  on conflict (entity_type, entity_id, kind) where status in ('pending', 'sent') do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- finalize_reminder: record the outcome of a claim. On 'sent' it also bumps the counter and writes
-- the activity row in the SAME transaction, so "sent but not counted" cannot happen.
-- Returns false when the claim is not pending (already finalised or reclaimed).
-- ---------------------------------------------------------------------------
create or replace function public.finalize_reminder(p_claim_id uuid, p_status text, p_reason text, p_message_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Invalid status.' using errcode = '22023';
  end if;

  select * into r from public.reminder_log where id = p_claim_id and status = 'pending' for update;
  if not found then
    return false;
  end if;

  update public.reminder_log
     set status = p_status,
         reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 200),
         provider_message_id = left(nullif(btrim(coalesce(p_message_id, '')), ''), 200)
   where id = r.id;

  if p_status = 'sent' then
    if r.entity_type = 'quote' then
      update public.quotes set followup_count = followup_count + 1, last_followup_at = now() where id = r.entity_id;
      insert into public.activity (business_id, entity_type, entity_id, event, meta)
      values (r.business_id, 'quote', r.entity_id, 'quote.followup_sent', jsonb_build_object('kind', r.kind, 'number', r.number));
    else
      update public.invoices set reminder_count = reminder_count + 1, last_reminder_at = now() where id = r.entity_id;
      insert into public.activity (business_id, entity_type, entity_id, event, meta)
      values (r.business_id, 'invoice', r.entity_id, 'invoice.reminder_sent', jsonb_build_object('kind', r.kind, 'number', r.number));
    end if;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_due_quote_followups: candidates for the one follow-up. SQL-side checks only; the cron route
-- re-checks everything (including the 8am-6pm window) in TypeScript with the same rules.
-- ---------------------------------------------------------------------------
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
         c.name, btrim(c.email), b.name, b.email, b.country, b.timezone, b.plan, b.logo_path,
         (b.plan in ('trial', 'free')), b.quote_followup_template,
         b.reminders_enabled, b.quote_followup_enabled, b.quote_followup_days, false
    from public.quotes q
    join public.businesses b on b.id = q.business_id
    join public.customers c on c.id = q.customer_id
   where q.status in ('sent', 'viewed')
     and q.followup_count = 0
     and b.reminders_enabled and b.quote_followup_enabled
     and b.plan in ('trial', 'pro', 'business')
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

-- ---------------------------------------------------------------------------
-- list_due_invoice_reminders: candidates for reminder 1 (count 0) or reminder 2 (count 1).
-- Overdue here means: sent / viewed, money still owed, due date before today in the business timezone
-- (a part-paid invoice that is past due counts). 'reminder_kind' says which reminder is next.
-- ---------------------------------------------------------------------------
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
         c.name, btrim(c.email), b.name, b.email, b.country, b.timezone, b.plan, b.logo_path,
         (b.plan in ('trial', 'free')),
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
     and b.plan in ('trial', 'pro', 'business')
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
-- is_unsubscribed: used by the manual "send reminder now" path and the cron re-check.
-- ---------------------------------------------------------------------------
create or replace function public.is_unsubscribed(p_business_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.unsubscribed_emails u
     where u.business_id = p_business_id and u.email = lower(btrim(coalesce(p_email, ''))));
$$;

-- ---------------------------------------------------------------------------
-- record_unsubscribe: add an address to a business's list (idempotent). Service role only; the
-- app calls it only after verifying a signed link.
-- ---------------------------------------------------------------------------
create or replace function public.record_unsubscribe(p_business_id uuid, p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.unsubscribed_emails (business_id, email)
  select b.id, lower(btrim(p_email)) from public.businesses b
   where b.id = p_business_id and char_length(btrim(coalesce(p_email, ''))) between 3 and 254
  on conflict do nothing;
$$;

-- ---------------------------------------------------------------------------
-- expire_due_quotes: sent / viewed quotes past valid_until (business timezone) become 'expired'.
-- Idempotent; returns how many were expired.
-- ---------------------------------------------------------------------------
create or replace function public.expire_due_quotes(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select q.id
      from public.quotes q
      join public.businesses b on b.id = q.business_id
     where q.status in ('sent', 'viewed')
       and q.valid_until is not null
       and q.valid_until < (now() at time zone b.timezone)::date
     order by q.valid_until
     limit least(greatest(coalesce(p_limit, 500), 1), 2000)
       for update of q skip locked
  ),
  upd as (
    update public.quotes q set status = 'expired'
      from due
     where q.id = due.id
    returning q.id, q.business_id, q.number
  )
  insert into public.activity (business_id, entity_type, entity_id, event, meta)
  select u.business_id, 'quote', u.id, 'quote.expired', jsonb_build_object('number', u.number) from upd u;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Service role only.
-- ---------------------------------------------------------------------------
revoke all on function public.claim_reminder(text, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_reminder(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.list_due_quote_followups(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.list_due_invoice_reminders(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.is_unsubscribed(uuid, text) from public, anon, authenticated;
revoke all on function public.record_unsubscribe(uuid, text) from public, anon, authenticated;
revoke all on function public.expire_due_quotes(integer) from public, anon, authenticated;

grant execute on function public.claim_reminder(text, uuid, text) to service_role;
grant execute on function public.finalize_reminder(uuid, text, text, text) to service_role;
grant execute on function public.list_due_quote_followups(timestamptz, integer) to service_role;
grant execute on function public.list_due_invoice_reminders(timestamptz, integer) to service_role;
grant execute on function public.is_unsubscribed(uuid, text) to service_role;
grant execute on function public.record_unsubscribe(uuid, text) to service_role;
grant execute on function public.expire_due_quotes(integer) to service_role;
